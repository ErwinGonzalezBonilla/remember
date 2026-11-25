"""Chat privado del cofre: conversación 1 a 1 entre dos usuarios conectados.

Privacidad (en el servidor):
- Solo se entra por una persona de TU lista (`person_id`), y solo si está conectada contigo en los dos sentidos
  (tu persona apunta a su cuenta y la suya a la tuya). Si no, no hay mensajes ni se puede escribir.
- Cada consulta filtra por la pareja exacta de usuarios: nadie más ve ni borra esos mensajes.
- Solo se borra lo propio.
Sin websockets (Vercel): el móvil pregunta cada pocos segundos mientras el chat está abierto.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_own_person
from ..models import ChatMessage, Person, User
from ..push import send_push
from ..schemas import ChatIn, ChatMessageOut, ChatOut
from ..storage import media_from

router = APIRouter(prefix="/api", tags=["chat"])

PAGE = 200   # últimos mensajes que se devuelven


def other_user(person: Person, user: User, db: Session) -> User | None:
    """La cuenta de esa persona si estáis conectados en los dos sentidos; si no, None."""
    if not person.linked_user_id:
        return None
    back = db.scalar(select(Person.id).where(Person.owner_id == person.linked_user_id, Person.linked_user_id == user.id))
    return db.get(User, person.linked_user_id) if back else None


def between(a: int, b: int):
    return or_(and_(ChatMessage.sender_id == a, ChatMessage.recipient_id == b),
               and_(ChatMessage.sender_id == b, ChatMessage.recipient_id == a))


def to_out(m: ChatMessage, user: User) -> ChatMessageOut:
    return ChatMessageOut(id=m.id, kind=m.kind, body=m.body, media_url=m.media_url, mine=m.sender_id == user.id,
                          created_at=m.created_at, read_at=m.read_at)


def _connected(person_id: int, user: User, db: Session) -> tuple[Person, User]:
    person = get_own_person(person_id, user, db)
    other = other_user(person, user, db)
    if not other:
        raise HTTPException(409, f"Podréis chatear cuando {person.name.split(' ')[0]} se conecte contigo.")
    return person, other


@router.get("/people/{person_id}/chat", response_model=ChatOut)
def get_chat(person_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Los últimos mensajes, del más antiguo al más nuevo. Al abrirlo, lo recibido queda como visto."""
    person = get_own_person(person_id, user, db)
    other = other_user(person, user, db)
    if not other:
        return ChatOut(can_chat=False, name=person.name, avatar_url=person.photo_url, messages=[])
    db.execute(update(ChatMessage).where(ChatMessage.sender_id == other.id, ChatMessage.recipient_id == user.id,
                                         ChatMessage.read_at.is_(None)).values(read_at=datetime.now(timezone.utc)))
    db.commit()
    rows = db.scalars(select(ChatMessage).where(between(user.id, other.id))
                      .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(PAGE)).all()
    return ChatOut(can_chat=True, name=person.name, avatar_url=person.photo_url or other.avatar_url,
                   messages=[to_out(m, user) for m in reversed(rows)])


@router.post("/people/{person_id}/chat", response_model=ChatMessageOut, status_code=201)
async def send(person_id: int, data: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person, other = _connected(person_id, user, db)
    body = (data.body or "").strip() or None
    media_url = None
    if data.kind == "text":
        if not body:
            raise HTTPException(422, "Escribe un mensaje.")
    else:
        if not data.media_key:
            raise HTTPException(422, "Adjunta la foto o la nota de voz.")
        media_url = await media_from(None, data.media_key, user.id, data.kind, f"u{user.id}/chat")
    msg = ChatMessage(sender_id=user.id, recipient_id=other.id, kind=data.kind, body=body, media_url=media_url)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    # Aviso en su móvil, que abre el chat desde su cofre (un aviso por conversación: el nuevo sustituye al anterior)
    theirs = db.scalar(select(Person.id).where(Person.owner_id == other.id, Person.linked_user_id == user.id))
    preview = body if data.kind == "text" else ("📷 Foto" if data.kind == "photo" else "🎤 Nota de voz")
    send_push(db, [other.id], user.full_name.split(" ")[0], preview[:120], f"/personas/{theirs}/chat", tag=f"chat-{user.id}")
    return to_out(msg, user)


@router.delete("/chat/{message_id}", status_code=204)
def delete_message(message_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Borrar un mensaje propio (para los dos). Uno ajeno o inexistente: 404, sin revelar nada."""
    msg = db.get(ChatMessage, message_id)
    if not msg or msg.sender_id != user.id:
        raise HTTPException(404, "Mensaje no encontrado.")
    db.delete(msg)
    db.commit()


@router.get("/chat/unread", response_model=dict[int, int])
def unread(person_id: int | None = Query(None), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mensajes sin leer por persona de tu lista: {person_id: n}. Para el punto rojo del botón Chat."""
    q = (select(Person.id, func.count(ChatMessage.id))
         .join(ChatMessage, and_(ChatMessage.sender_id == Person.linked_user_id, ChatMessage.recipient_id == user.id))
         .where(Person.owner_id == user.id, ChatMessage.read_at.is_(None)).group_by(Person.id))
    if person_id is not None:
        q = q.where(Person.id == person_id)
    return dict(db.execute(q).all())


def remove_user_chat(user: User, db: Session):
    """Al eliminar la cuenta: sus conversaciones desaparecen para los dos."""
    from sqlalchemy import delete
    db.execute(delete(ChatMessage).where(or_(ChatMessage.sender_id == user.id, ChatMessage.recipient_id == user.id)))
