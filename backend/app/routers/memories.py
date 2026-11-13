from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..deps import get_current_user, get_own_person, get_visible_memory, visible_to
from ..on_this_day import memory_day, on_this_day, utc_today
from pydantic import TypeAdapter, ValidationError

from ..models import Comment, Memory, MemoryMedia, MemoryTag, Notification, Person, Reaction, User
from ..schemas import (MEDIA_MAX, CommentIn, CommentOut, MediaAddIn, MediaItemOut, MediaKeyIn, MediaOrderIn,
                       MemoryDetailOut, MemoryOut, MemoryUpdate, PersonTag, ReactionIn, clean_milestone)
from ..storage import media_from, poster_from
from .notifications import mark_memory_read, notify_comment, notify_tagged

router = APIRouter(prefix="/api", tags=["recuerdos"])

KINDS = {"photo", "video", "audio", "text"}
ALBUM_KINDS = {"photo", "video"}

# Carga en bloque lo que necesita to_out(): ~6 consultas en total en vez de 4-5 por recuerdo
EAGER = (joinedload(Memory.author), selectinload(Memory.tags).joinedload(MemoryTag.person),
         selectinload(Memory.reactions), selectinload(Memory.comments), selectinload(Memory.media))


def media_items(memory: Memory) -> list[MediaItemOut]:
    """El álbum. Un recuerdo antiguo de foto o video, sin filas en memory_media, es un álbum de un elemento."""
    if memory.media:
        return [MediaItemOut(id=m.id, kind=m.kind, url=m.url, poster_url=m.poster_url, position=i)
                for i, m in enumerate(memory.media)]
    if memory.kind in ALBUM_KINDS and memory.media_url:
        return [MediaItemOut(id=None, kind=memory.kind, url=memory.media_url, poster_url=memory.poster_url, position=0)]
    return []


def _media_count(memory: Memory) -> int:
    return len(memory.media) or (1 if memory.kind in ALBUM_KINDS and memory.media_url else 0)


def _sync_cover(memory: Memory):
    """Numera el álbum de nuevo y copia el primer elemento a la portada (media_url, poster_url y kind)."""
    for i, m in enumerate(memory.media):
        m.position = i
    if memory.media:
        first = memory.media[0]
        memory.media_url, memory.poster_url, memory.kind = first.url, first.poster_url, first.kind


async def _resolve_items(items: list[MediaKeyIn], user: User) -> list[MemoryMedia]:
    """Comprueba cada archivo como media_key: que sea tuyo, que exista y que su tamaño y tipo sean válidos."""
    out = []
    for it in items:
        url = await media_from(None, it.key, user.id, it.kind, f"u{user.id}")
        poster = await poster_from(it.poster_key, user.id) if it.kind == "video" else None
        out.append(MemoryMedia(kind=it.kind, url=url, poster_url=poster))
    return out


def _parse_media_keys(raw: str) -> list[MediaKeyIn]:
    try:
        items = TypeAdapter(list[MediaKeyIn]).validate_json(raw)
    except ValidationError:
        raise HTTPException(422, "La lista de archivos no es válida.")
    if not items:
        raise HTTPException(422, "Adjunta al menos una foto o un video.")
    if len(items) > MEDIA_MAX:
        raise HTTPException(422, f"Un recuerdo puede tener como mucho {MEDIA_MAX} fotos y videos.")
    return items


def _tag(person: Person, memory: Memory, user: User) -> PersonTag:
    """La fecha de nacimiento solo la ve quien guardó el recuerdo, o la propia persona etiquetada:
    el resto de etiquetados no recibe el cumpleaños que el autor guardó de otras personas."""
    own_birthday = memory.author_id == user.id or person.linked_user_id == user.id
    return PersonTag(id=person.id, name=person.name, relation=person.relation, relation_label=person.relation_label,
                     photo_url=person.photo_url, birth_date=person.birth_date if own_birthday else None)


def to_out(memory: Memory, user: User) -> MemoryOut:
    counts = Counter(r.emoji for r in memory.reactions)
    mine = next((r.emoji for r in memory.reactions if r.user_id == user.id), None)
    return MemoryOut(
        id=memory.id, kind=memory.kind, title=memory.title, description=memory.description,
        media_url=memory.media_url, poster_url=memory.poster_url, location=memory.location, happened_on=memory.happened_on,
        milestone=memory.milestone, created_at=memory.created_at, author_id=memory.author_id, author_name=memory.author.full_name,
        people=[_tag(t.person, memory, user) for t in memory.tags],
        reactions=dict(counts), my_reaction=mine, comment_count=len(memory.comments),
        can_edit=memory.author_id == user.id, media_count=_media_count(memory),
    )


def to_detail(memory: Memory, user: User) -> MemoryDetailOut:
    return MemoryDetailOut(
        **to_out(memory, user).model_dump(),
        comments=[CommentOut(id=c.id, body=c.body, author_id=c.author_id, author_name=c.author.full_name,
                             author_avatar=c.author.avatar_url, created_at=c.created_at) for c in memory.comments],
        media=media_items(memory),
    )


def _own_people(person_ids: list[int], user: User, db: Session) -> list[Person]:
    """Solo puedes etiquetar a personas de tu propia lista."""
    ids = set(person_ids)
    if not ids:
        return []
    people = db.scalars(select(Person).where(Person.id.in_(ids), Person.owner_id == user.id)).all()
    if len(people) != len(ids):
        raise HTTPException(422, "Alguna de las personas etiquetadas no está en tu lista.")
    return list(people)


def _parse_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        return [int(x) for x in raw.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(422, "Etiquetas no válidas.")


def _require_author(memory: Memory, user: User):
    if memory.author_id != user.id:
        raise HTTPException(403, "Solo quien guardó este recuerdo puede cambiarlo.")


@router.get("/memories", response_model=list[MemoryOut])
def list_memories(
    person_id: int | None = Query(None),
    kind: str | None = Query(None),
    untagged: bool = Query(False, description="Solo los que no tienen a nadie etiquetado"),
    limit: int = Query(200, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = select(Memory).where(visible_to(user))
    if person_id is not None:
        # El cofre de una persona: lo que tú etiquetaste con ella y, si está conectada,
        # también lo que ella guardó y etiquetó contigo (lo que compartís).
        person = get_own_person(person_id, user, db)
        cond = Memory.tags.any(MemoryTag.person_id == person.id)
        if person.linked_user_id:
            from_them = and_(Memory.author_id == person.linked_user_id,
                             Memory.tags.any(MemoryTag.person.has(Person.linked_user_id == user.id)))
            cond = or_(cond, from_them)
        q = q.where(cond)
    if untagged:
        q = q.where(~Memory.tags.any())
    if kind in KINDS:
        q = q.where(Memory.kind == kind)
    q = q.order_by(Memory.happened_on.desc().nulls_last(), Memory.created_at.desc()).limit(limit).options(*EAGER)
    return [to_out(m, user) for m in db.scalars(q).unique()]


@router.post("/memories", response_model=MemoryOut, status_code=201)
async def create_memory(
    kind: str = Form(...),
    title: str = Form(..., min_length=1, max_length=120),
    description: str | None = Form(None),
    location: str | None = Form(None),
    happened_on: date | None = Form(None),
    person_ids: str | None = Form(None, description="IDs separados por coma: 3,7"),
    milestone: str | None = Form(None, description="Momento especial: 'Primeros pasos'…"),
    file: UploadFile | None = File(None),
    media_key: str | None = Form(None, description="Clave del archivo ya subido con /api/uploads"),
    poster_key: str | None = Form(None, description="Miniatura del video (JPEG) ya subida"),
    media_keys: str | None = Form(None, description='Álbum: lista JSON [{"key", "kind", "poster_key"}]'),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if kind not in KINDS:
        raise HTTPException(422, "Tipo de recuerdo no válido.")
    try:
        milestone = clean_milestone(milestone)
    except ValueError as e:
        raise HTTPException(422, str(e))
    people = _own_people(_parse_ids(person_ids), user, db)
    media_url = poster_url = None
    album: list[MemoryMedia] = []
    if media_keys:
        album = await _resolve_items(_parse_media_keys(media_keys), user)
    elif kind == "text":
        if not (description or "").strip():
            raise HTTPException(422, "Escribe el texto de tu nota.")
    else:
        if not file and not media_key:
            raise HTTPException(422, "Adjunta el archivo del recuerdo.")
        media_url = await media_from(file, media_key, user.id, kind, f"u{user.id}")
        if kind == "video":
            poster_url = await poster_from(poster_key, user.id)
        if kind in ALBUM_KINDS:
            album = [MemoryMedia(kind=kind, url=media_url, poster_url=poster_url)]

    memory = Memory(
        author_id=user.id, kind=kind, title=title.strip(),
        description=(description or "").strip() or None, location=(location or "").strip() or None,
        happened_on=happened_on, media_url=media_url, poster_url=poster_url, milestone=milestone,
        tags=[MemoryTag(person_id=p.id) for p in people], media=album,
    )
    _sync_cover(memory)  # con álbum, el tipo y la portada son los del primer elemento
    db.add(memory)
    db.commit()
    db.refresh(memory)
    notify_tagged(memory, {p.id for p in people}, user, db)
    return to_out(memory, user)


# Declarada antes de /memories/{memory_id} para que "on-this-day" no se lea como un id
@router.get("/memories/on-this-day", response_model=list[MemoryOut])
def memories_on_this_day(
    today: date | None = Query(None, description="Fecha local del móvil (AAAA-MM-DD)"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Un día como hoy: recuerdos visibles de años anteriores con el mismo día y mes, del más antiguo al más reciente.
    `today` es la fecha local de quien mira; si se aleja más de un día de la fecha UTC, se usa la UTC."""
    utc = utc_today()
    if today is None or abs((today - utc).days) > 1:
        today = utc
    memories = db.scalars(on_this_day(user, today).options(*EAGER)).unique().all()
    return [to_out(m, user) for m in sorted(memories, key=memory_day)]


@router.get("/memories/{memory_id}", response_model=MemoryDetailOut)
def get_memory(memory_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memory = get_visible_memory(memory_id, user, db)
    mark_memory_read(memory.id, user, db)
    return to_detail(memory, user)


@router.put("/memories/{memory_id}", response_model=MemoryDetailOut)
def update_memory(memory_id: int, data: MemoryUpdate, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    memory = get_visible_memory(memory_id, user, db)
    _require_author(memory, user)
    people = _own_people(data.person_ids, user, db)
    memory.title = data.title.strip()
    memory.description = (data.description or "").strip() or None
    memory.location = (data.location or "").strip() or None
    memory.happened_on = data.happened_on
    if "milestone" in data.model_fields_set:  # si no lo envían, se queda como estaba
        memory.milestone = data.milestone
    wanted = {p.id for p in people}
    added = wanted - {t.person_id for t in memory.tags}
    memory.tags = [t for t in memory.tags if t.person_id in wanted] + [MemoryTag(person_id=pid) for pid in added]
    db.commit()
    db.refresh(memory)
    notify_tagged(memory, added, user, db)
    return to_detail(memory, user)


@router.delete("/memories/{memory_id}", status_code=204)
def delete_memory(memory_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memory = get_visible_memory(memory_id, user, db)
    _require_author(memory, user)
    db.execute(delete(Notification).where(Notification.memory_id == memory.id))
    db.delete(memory)
    db.commit()


# ---------- Álbum ----------
def _album_memory(memory_id: int, user: User, db: Session) -> Memory:
    memory = get_visible_memory(memory_id, user, db)
    _require_author(memory, user)
    if memory.kind not in ALBUM_KINDS:
        raise HTTPException(422, "Solo los recuerdos de fotos y videos tienen álbum.")
    if not memory.media and memory.media_url:  # recuerdo antiguo: su foto pasa a ser la primera fila
        memory.media.append(MemoryMedia(kind=memory.kind, url=memory.media_url, poster_url=memory.poster_url))
        db.flush()
    return memory


def _album_saved(memory: Memory, user: User, db: Session) -> MemoryDetailOut:
    _sync_cover(memory)
    db.commit()
    db.refresh(memory)
    return to_detail(memory, user)


@router.post("/memories/{memory_id}/media", response_model=MemoryDetailOut, status_code=201)
async def add_media(memory_id: int, data: MediaAddIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    memory = _album_memory(memory_id, user, db)
    if len(memory.media) + len(data.items) > MEDIA_MAX:
        raise HTTPException(422, f"Un recuerdo puede tener como mucho {MEDIA_MAX} fotos y videos.")
    memory.media.extend(await _resolve_items(data.items, user))
    return _album_saved(memory, user, db)


@router.delete("/memories/{memory_id}/media/{media_id}", response_model=MemoryDetailOut)
def remove_media(memory_id: int, media_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memory = _album_memory(memory_id, user, db)
    item = next((m for m in memory.media if m.id == media_id), None)
    if not item:
        raise HTTPException(404, "Esa foto no está en el recuerdo.")
    if len(memory.media) == 1:
        raise HTTPException(422, "El recuerdo necesita al menos una foto o un video.")
    memory.media.remove(item)
    return _album_saved(memory, user, db)


@router.put("/memories/{memory_id}/media/order", response_model=MemoryDetailOut)
def reorder_media(memory_id: int, data: MediaOrderIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    memory = _album_memory(memory_id, user, db)
    by_id = {m.id: m for m in memory.media}
    if len(data.ids) != len(by_id) or set(data.ids) != set(by_id):
        raise HTTPException(422, "El orden debe incluir todas las fotos del recuerdo, una vez cada una.")
    memory.media = [by_id[i] for i in data.ids]
    return _album_saved(memory, user, db)


# ---------- Reacciones ----------
@router.put("/memories/{memory_id}/reaction", response_model=MemoryOut)
def react(memory_id: int, data: ReactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memory = get_visible_memory(memory_id, user, db)
    existing = next((r for r in memory.reactions if r.user_id == user.id), None)
    if existing:
        existing.emoji = data.emoji
    else:
        memory.reactions.append(Reaction(user_id=user.id, emoji=data.emoji))
    db.commit()
    return to_out(memory, user)


@router.delete("/memories/{memory_id}/reaction", response_model=MemoryOut)
def unreact(memory_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memory = get_visible_memory(memory_id, user, db)
    existing = next((r for r in memory.reactions if r.user_id == user.id), None)
    if existing:
        memory.reactions.remove(existing)
        db.commit()
    return to_out(memory, user)


# ---------- Comentarios ----------
@router.post("/memories/{memory_id}/comments", response_model=MemoryDetailOut, status_code=201)
def add_comment(memory_id: int, data: CommentIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    memory = get_visible_memory(memory_id, user, db)
    memory.comments.append(Comment(author_id=user.id, body=data.body.strip()))
    db.commit()
    db.refresh(memory)
    notify_comment(memory, user, db, data.body.strip())
    return to_detail(memory, user)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comment = db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(404, "Comentario no encontrado.")
    memory = get_visible_memory(comment.memory_id, user, db)
    if comment.author_id != user.id and memory.author_id != user.id:
        raise HTTPException(403, "No puedes eliminar este comentario.")
    db.delete(comment)
    db.commit()
