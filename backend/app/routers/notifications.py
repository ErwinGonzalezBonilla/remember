"""Avisos: "Félix guardó un recuerdo contigo", "Félix comentó en «…»".
Se crean al etiquetar a una persona conectada o al comentar, y se marcan como leídos al verlos."""
from datetime import datetime, timezone
from html import escape

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, visible_to
from ..mailer import first_name, send_email
from ..push import send_push
from ..models import Memory, Notification, Person, User
from ..schemas import NotificationOut, NotificationsOut

router = APIRouter(prefix="/api/notifications", tags=["avisos"])

KIND_TEXT = {"photo": "una foto", "video": "un video", "audio": "un audio", "text": "una nota"}


def notify_tagged(memory: Memory, person_ids: set[int], author: User, db: Session):
    """Avisa (en la app y por correo) a las cuentas conectadas de las personas recién etiquetadas."""
    if not person_ids:
        return
    users = db.scalars(select(User).join(Person, Person.linked_user_id == User.id).where(
        Person.id.in_(person_ids), Person.owner_id == author.id, User.id != author.id)).unique().all()
    for to in users:
        already = db.scalar(select(Notification.id).where(
            Notification.user_id == to.id, Notification.memory_id == memory.id, Notification.kind == "memory_tag"))
        if already:
            continue
        db.add(Notification(user_id=to.id, actor_id=author.id, kind="memory_tag", memory_id=memory.id))
        db.commit()
        send_push(db, [to.id], f"{author.full_name.split(' ')[0]} guardó {KIND_TEXT.get(memory.kind, 'un recuerdo')} contigo",
                  f"«{memory.title}»", f"/recuerdo/{memory.id}", tag=f"memory-{memory.id}")
        send_email(
            to.email, f"{author.full_name} guardó un recuerdo contigo", "Tienes un recuerdo nuevo 💛",
            [f"Hola, {first_name(to.full_name)}. <b>{first_name(author.full_name)}</b> guardó {KIND_TEXT.get(memory.kind, 'un recuerdo')} "
             f"contigo en Rehomi: <b>“{escape(memory.title)}”</b>.",
             "Entra para verlo, reaccionar o dejarle un comentario."],
            button=("Ver el recuerdo", f"{settings.public_url}/recuerdo/{memory.id}"),
        )


def notify_comment(memory: Memory, commenter: User, db: Session, body: str = ""):
    """Avisa (solo en la app) al autor del recuerdo y a las demás personas conectadas etiquetadas."""
    tagged = set(db.scalars(select(Person.linked_user_id).where(
        Person.id.in_([t.person_id for t in memory.tags]), Person.owner_id == memory.author_id,
        Person.linked_user_id.is_not(None))))
    to = (tagged | {memory.author_id}) - {commenter.id}
    for uid in to:
        db.add(Notification(user_id=uid, actor_id=commenter.id, kind="comment", memory_id=memory.id))
    db.commit()
    text = body if len(body) <= 90 else body[:88] + "…"
    send_push(db, to, f"{commenter.full_name.split(' ')[0]} comentó en «{memory.title}»", text or "Nuevo comentario",
              f"/recuerdo/{memory.id}", tag=f"comment-{memory.id}")


def mark_memory_read(memory_id: int, user: User, db: Session):
    db.execute(update(Notification).where(
        Notification.user_id == user.id, Notification.memory_id == memory_id, Notification.read_at.is_(None)
    ).values(read_at=datetime.now(timezone.utc)))
    db.commit()


def _visible(user: User):
    """Solo avisos de recuerdos que siguen existiendo y que todavía puedes ver."""
    return select(Notification).join(Memory, Memory.id == Notification.memory_id).where(
        Notification.user_id == user.id,
        Memory.id.in_(select(Memory.id).where(visible_to(user))))


@router.get("", response_model=NotificationsOut)
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = _visible(user)
    unread = db.scalar(select(func.count()).select_from(q.where(Notification.read_at.is_(None)).subquery())) or 0
    items = db.scalars(q.order_by(Notification.created_at.desc()).limit(40)).all()
    return NotificationsOut(unread=unread, items=[NotificationOut(
        id=n.id, kind=n.kind, created_at=n.created_at, read=n.read_at is not None,
        actor_name=n.actor.full_name, actor_avatar=n.actor.avatar_url,
        memory_id=n.memory_id, memory_title=n.memory.title, memory_kind=n.memory.kind) for n in items])


@router.post("/read", status_code=204)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
               .values(read_at=datetime.now(timezone.utc)))
    db.commit()
