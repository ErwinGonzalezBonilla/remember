"""Cápsula del tiempo: contenido para una persona, sellado hasta una fecha.

Reglas de privacidad (todas en el servidor):
- Quien la crea la ve siempre (borrador, sellada y abierta).
- La persona destinataria solo la ve si tiene cuenta, está conectada (Person.linked_user_id) y la cápsula
  está sellada. Antes de `open_at` recibe solo título, remitente, fecha y cuántos archivos tiene:
  el mensaje, la portada y los archivos no salen del servidor.
- Cualquier otra persona recibe 404: ni siquiera sabe que existe.
"""
from collections import Counter
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, get_own_person
from ..mailer import first_name, send_email
from ..models import CapsuleComment, CapsuleItem, CapsuleReaction, Person, TimeCapsule, User
from ..schemas import (CapsuleDetailOut, CapsuleIn, CapsuleItemOut, CapsuleOut, CapsulesOut, CommentIn, CommentOut,
                       PersonTag, ReactionIn)
from ..storage import save_media

router = APIRouter(prefix="/api", tags=["cápsulas"])

MAX_ITEMS = 10
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
          "noviembre", "diciembre"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """SQLite devuelve fechas sin zona: se interpretan como UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def status_of(c: TimeCapsule) -> str:
    if not c.sealed_at:
        return "draft"
    return "open" if aware(c.open_at) <= utcnow() else "sealed"


def recipient_id(c: TimeCapsule) -> int | None:
    return c.person.linked_user_id if c.person else None


def can_see(c: TimeCapsule, user: User) -> bool:
    return c.author_id == user.id or (c.sealed_at is not None and recipient_id(c) == user.id)


def human_date(c: TimeCapsule) -> str:
    try:
        local = aware(c.open_at).astimezone(ZoneInfo(c.timezone))
    except Exception:  # noqa: BLE001 - zona horaria desconocida: se muestra en UTC
        local = aware(c.open_at)
    return f"{local.day} de {MONTHS[local.month - 1]} de {local.year} a las {local:%H:%M}"


def to_out(c: TimeCapsule, user: User) -> CapsuleOut:
    is_author = c.author_id == user.id
    st = status_of(c)
    locked = not is_author and st != "open"
    counts = Counter(r.emoji for r in c.reactions)
    return CapsuleOut(
        id=c.id, title=c.title, status=st, locked=locked, open_at=aware(c.open_at), timezone=c.timezone,
        sealed_at=c.sealed_at, created_at=c.created_at, is_author=is_author,
        author_name=c.author.full_name, author_avatar=c.author.avatar_url,
        person=PersonTag(id=c.person.id, name=c.person.name, relation=c.person.relation,
                         photo_url=c.person.photo_url) if is_author and c.person else None,
        message=None if locked else c.message,
        cover_url=None if locked else c.cover_url,
        items=[] if locked else [CapsuleItemOut(id=i.id, kind=i.kind, media_url=i.media_url) for i in c.items],
        item_counts=dict(Counter(i.kind for i in c.items)),
        reactions=dict(counts), my_reaction=next((r.emoji for r in c.reactions if r.user_id == user.id), None),
        comment_count=len(c.comments),
    )


def to_detail(c: TimeCapsule, user: User) -> CapsuleDetailOut:
    return CapsuleDetailOut(
        **to_out(c, user).model_dump(),
        comments=[CommentOut(id=m.id, body=m.body, author_id=m.author_id, author_name=m.author.full_name,
                             author_avatar=m.author.avatar_url, created_at=m.created_at) for m in c.comments],
    )


def get_capsule(capsule_id: int, user: User, db: Session) -> TimeCapsule:
    c = db.get(TimeCapsule, capsule_id)
    if not c or not can_see(c, user):
        raise HTTPException(404, "Cápsula no encontrada.")
    return c


def own_draft(capsule_id: int, user: User, db: Session) -> TimeCapsule:
    c = get_capsule(capsule_id, user, db)
    if c.author_id != user.id:
        raise HTTPException(403, "Solo quien creó la cápsula puede cambiarla.")
    if c.sealed_at:
        raise HTTPException(409, "La cápsula ya está sellada y no se puede modificar.")
    return c


def require_open(c: TimeCapsule):
    if status_of(c) != "open":
        raise HTTPException(409, "Podrás reaccionar y comentar cuando la cápsula se abra.")


def check_future(open_at: datetime):
    if aware(open_at) <= utcnow():
        raise HTTPException(422, "La fecha de apertura tiene que ser en el futuro.")


def check_timezone(tz: str):
    try:
        ZoneInfo(tz)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "Zona horaria no válida.")


# ---------- Listado y detalle ----------
@router.get("/capsules", response_model=CapsulesOut)
def list_capsules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sent = db.scalars(select(TimeCapsule).where(TimeCapsule.author_id == user.id)
                      .order_by(TimeCapsule.open_at)).all()
    received = db.scalars(select(TimeCapsule).where(
        TimeCapsule.sealed_at.is_not(None), TimeCapsule.author_id != user.id,
        TimeCapsule.person.has(Person.linked_user_id == user.id)).order_by(TimeCapsule.open_at)).all()
    return CapsulesOut(received=[to_out(c, user) for c in received], sent=[to_out(c, user) for c in sent])


@router.get("/capsules/{capsule_id}", response_model=CapsuleDetailOut)
def get_one(capsule_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_capsule(capsule_id, user, db)
    detail = to_detail(c, user)
    if detail.locked:
        detail.comments = []
    return detail


# ---------- Crear y editar el borrador ----------
@router.post("/capsules", response_model=CapsuleDetailOut, status_code=201)
def create(data: CapsuleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = get_own_person(data.person_id, user, db)
    check_future(data.open_at)
    check_timezone(data.timezone)
    c = TimeCapsule(author_id=user.id, person_id=person.id, title=data.title.strip(),
                    message=(data.message or "").strip() or None, open_at=data.open_at, timezone=data.timezone)
    db.add(c)
    db.commit()
    db.refresh(c)
    return to_detail(c, user)


@router.put("/capsules/{capsule_id}", response_model=CapsuleDetailOut)
def update(capsule_id: int, data: CapsuleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = own_draft(capsule_id, user, db)
    person = get_own_person(data.person_id, user, db)
    check_future(data.open_at)
    check_timezone(data.timezone)
    c.person_id, c.title = person.id, data.title.strip()
    c.message = (data.message or "").strip() or None
    c.open_at, c.timezone = data.open_at, data.timezone
    db.commit()
    db.refresh(c)
    return to_detail(c, user)


@router.post("/capsules/{capsule_id}/items", response_model=CapsuleDetailOut, status_code=201)
async def add_item(capsule_id: int, kind: str = Form(...), file: UploadFile = File(...),
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = own_draft(capsule_id, user, db)
    if kind not in {"photo", "video", "audio"}:
        raise HTTPException(422, "Tipo de archivo no válido.")
    if len(c.items) >= MAX_ITEMS:
        raise HTTPException(422, f"Una cápsula puede tener como máximo {MAX_ITEMS} archivos.")
    url = await save_media(file, kind, f"u{user.id}/capsulas")
    c.items.append(CapsuleItem(kind=kind, media_url=url))
    db.commit()
    db.refresh(c)
    return to_detail(c, user)


@router.delete("/capsules/{capsule_id}/items/{item_id}", response_model=CapsuleDetailOut)
def remove_item(capsule_id: int, item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = own_draft(capsule_id, user, db)
    item = next((i for i in c.items if i.id == item_id), None)
    if not item:
        raise HTTPException(404, "Archivo no encontrado.")
    c.items.remove(item)
    db.commit()
    db.refresh(c)
    return to_detail(c, user)


@router.post("/capsules/{capsule_id}/cover", response_model=CapsuleDetailOut)
async def set_cover(capsule_id: int, file: UploadFile = File(...),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = own_draft(capsule_id, user, db)
    c.cover_url = await save_media(file, "photo", f"u{user.id}/capsulas")
    db.commit()
    return to_detail(c, user)


@router.delete("/capsules/{capsule_id}/cover", response_model=CapsuleDetailOut)
def remove_cover(capsule_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = own_draft(capsule_id, user, db)
    c.cover_url = None
    db.commit()
    return to_detail(c, user)


# ---------- Sellar ----------
@router.post("/capsules/{capsule_id}/seal", response_model=CapsuleDetailOut)
def seal(capsule_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = own_draft(capsule_id, user, db)
    if not c.person:
        raise HTTPException(422, "Elige para quién es la cápsula.")
    if not c.message and not c.items:
        raise HTTPException(422, "Añade un mensaje o al menos una foto, video o audio antes de sellarla.")
    check_future(c.open_at)
    c.sealed_at = utcnow()
    db.commit()
    db.refresh(c)
    to_id = recipient_id(c)
    if to_id:
        to = db.get(User, to_id)
        send_email(
            to.email, f"{c.author.full_name} te dejó una cápsula del tiempo", "Tienes una cápsula del tiempo 🎁",
            [f"Hola, {first_name(to.full_name)}. <b>{first_name(c.author.full_name)}</b> guardó algo especial para ti en REHOMI.",
             f"La cápsula está sellada y se abrirá el <b>{human_date(c)}</b>. Hasta entonces, es una sorpresa."],
            button=("Ver la cuenta atrás", f"{settings.public_url}/capsula/{c.id}"),
        )
    return to_detail(c, user)


@router.delete("/capsules/{capsule_id}", status_code=204)
def delete(capsule_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_capsule(capsule_id, user, db)
    if c.author_id != user.id:
        raise HTTPException(403, "Solo quien creó la cápsula puede eliminarla.")
    db.delete(c)
    db.commit()


# ---------- Reacciones y comentarios (solo cuando está abierta) ----------
@router.put("/capsules/{capsule_id}/reaction", response_model=CapsuleDetailOut)
def react(capsule_id: int, data: ReactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_capsule(capsule_id, user, db)
    require_open(c)
    mine = next((r for r in c.reactions if r.user_id == user.id), None)
    if mine:
        mine.emoji = data.emoji
    else:
        c.reactions.append(CapsuleReaction(user_id=user.id, emoji=data.emoji))
    db.commit()
    return to_detail(c, user)


@router.delete("/capsules/{capsule_id}/reaction", response_model=CapsuleDetailOut)
def unreact(capsule_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_capsule(capsule_id, user, db)
    mine = next((r for r in c.reactions if r.user_id == user.id), None)
    if mine:
        c.reactions.remove(mine)
        db.commit()
    return to_detail(c, user)


@router.post("/capsules/{capsule_id}/comments", response_model=CapsuleDetailOut, status_code=201)
def comment(capsule_id: int, data: CommentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_capsule(capsule_id, user, db)
    require_open(c)
    c.comments.append(CapsuleComment(author_id=user.id, body=data.body.strip()))
    db.commit()
    db.refresh(c)
    return to_detail(c, user)


@router.delete("/capsules/{capsule_id}/comments/{comment_id}", status_code=204)
def delete_comment(capsule_id: int, comment_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    c = get_capsule(capsule_id, user, db)
    m = next((x for x in c.comments if x.id == comment_id), None)
    if not m:
        raise HTTPException(404, "Comentario no encontrado.")
    if m.author_id != user.id and c.author_id != user.id:
        raise HTTPException(403, "No puedes eliminar este comentario.")
    c.comments.remove(m)
    db.commit()


# ---------- Aviso diario: cápsulas que ya se abrieron ----------
@router.get("/cron/capsules")
def notify_opened(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """Vercel Cron lo llama una vez al día con 'Authorization: Bearer $CRON_SECRET'.
    Envía un correo a la persona destinataria de cada cápsula que ya llegó a su fecha."""
    if settings.cron_secret:
        if authorization != f"Bearer {settings.cron_secret}":
            raise HTTPException(401, "No autorizado.")
    elif settings.is_production:
        raise HTTPException(503, "Falta CRON_SECRET.")
    due = db.scalars(select(TimeCapsule).where(
        TimeCapsule.sealed_at.is_not(None), TimeCapsule.open_notified.is_(False),
        TimeCapsule.open_at <= utcnow())).all()
    sent = 0
    for c in due:
        to_id = recipient_id(c)
        if not to_id:
            continue  # aún no tiene cuenta: la verá abierta cuando se conecte
        to = db.get(User, to_id)
        ok = send_email(
            to.email, "¡Tu cápsula del tiempo ya se puede abrir! 🎉", f"Llegó el día: “{c.title}”",
            [f"Hola, {first_name(to.full_name)}. La cápsula que <b>{first_name(c.author.full_name)}</b> guardó para ti ya está abierta.",
             "Entra para ver lo que te dejó y contarle qué te pareció."],
            button=("Abrir mi cápsula", f"{settings.public_url}/capsula/{c.id}"),
        )
        if ok:
            c.open_notified = True
            sent += 1
    db.commit()
    return {"pending": len(due), "sent": sent}


def remove_user_capsules(user: User, db: Session):
    """Al eliminar una cuenta: sus cápsulas, y sus reacciones y comentarios en cápsulas ajenas."""
    for c in db.scalars(select(TimeCapsule).where(TimeCapsule.author_id == user.id)):
        db.delete(c)
    for model, col in ((CapsuleReaction, CapsuleReaction.user_id), (CapsuleComment, CapsuleComment.author_id)):
        for row in db.scalars(select(model).where(col == user.id)):
            db.delete(row)


def detach_person(person: Person, db: Session):
    """Al borrar a una persona de tu lista, sus cápsulas quedan sin destinataria (no se borran)."""
    for c in db.scalars(select(TimeCapsule).where(TimeCapsule.person_id == person.id)):
        c.person_id = None
