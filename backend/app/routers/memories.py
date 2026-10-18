from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_visible_memory, visible_to
from ..models import Comment, Memory, MemoryTag, Person, Reaction, User
from ..schemas import CommentIn, CommentOut, MemoryDetailOut, MemoryOut, MemoryUpdate, PersonTag, ReactionIn
from ..storage import save_media

router = APIRouter(prefix="/api", tags=["recuerdos"])

KINDS = {"photo", "video", "audio", "text"}


def to_out(memory: Memory, user: User) -> MemoryOut:
    counts = Counter(r.emoji for r in memory.reactions)
    mine = next((r.emoji for r in memory.reactions if r.user_id == user.id), None)
    return MemoryOut(
        id=memory.id, kind=memory.kind, title=memory.title, description=memory.description,
        media_url=memory.media_url, location=memory.location, happened_on=memory.happened_on,
        created_at=memory.created_at, author_id=memory.author_id, author_name=memory.author.full_name,
        people=[PersonTag(id=t.person.id, name=t.person.name, relation=t.person.relation,
                          photo_url=t.person.photo_url) for t in memory.tags],
        reactions=dict(counts), my_reaction=mine, comment_count=len(memory.comments),
        can_edit=memory.author_id == user.id,
    )


def to_detail(memory: Memory, user: User) -> MemoryDetailOut:
    return MemoryDetailOut(
        **to_out(memory, user).model_dump(),
        comments=[CommentOut(id=c.id, body=c.body, author_id=c.author_id, author_name=c.author.full_name,
                             author_avatar=c.author.avatar_url, created_at=c.created_at) for c in memory.comments],
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
        q = q.where(Memory.tags.any(MemoryTag.person_id == person_id))
    if untagged:
        q = q.where(~Memory.tags.any())
    if kind in KINDS:
        q = q.where(Memory.kind == kind)
    q = q.order_by(Memory.happened_on.desc().nulls_last(), Memory.created_at.desc()).limit(limit)
    return [to_out(m, user) for m in db.scalars(q)]


@router.post("/memories", response_model=MemoryOut, status_code=201)
async def create_memory(
    kind: str = Form(...),
    title: str = Form(..., min_length=1, max_length=120),
    description: str | None = Form(None),
    location: str | None = Form(None),
    happened_on: date | None = Form(None),
    person_ids: str | None = Form(None, description="IDs separados por coma: 3,7"),
    file: UploadFile | None = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if kind not in KINDS:
        raise HTTPException(422, "Tipo de recuerdo no válido.")
    people = _own_people(_parse_ids(person_ids), user, db)
    media_url = None
    if kind == "text":
        if not (description or "").strip():
            raise HTTPException(422, "Escribe el texto de tu nota.")
    else:
        if not file:
            raise HTTPException(422, "Adjunta el archivo del recuerdo.")
        media_url = await save_media(file, kind, f"u{user.id}")

    memory = Memory(
        author_id=user.id, kind=kind, title=title.strip(),
        description=(description or "").strip() or None, location=(location or "").strip() or None,
        happened_on=happened_on, media_url=media_url,
        tags=[MemoryTag(person_id=p.id) for p in people],
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return to_out(memory, user)


@router.get("/memories/{memory_id}", response_model=MemoryDetailOut)
def get_memory(memory_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return to_detail(get_visible_memory(memory_id, user, db), user)


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
    wanted = {p.id for p in people}
    memory.tags = [t for t in memory.tags if t.person_id in wanted] + [
        MemoryTag(person_id=pid) for pid in wanted - {t.person_id for t in memory.tags}]
    db.commit()
    db.refresh(memory)
    return to_detail(memory, user)


@router.delete("/memories/{memory_id}", status_code=204)
def delete_memory(memory_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memory = get_visible_memory(memory_id, user, db)
    _require_author(memory, user)
    db.delete(memory)
    db.commit()


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
