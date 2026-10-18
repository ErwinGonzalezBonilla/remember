from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Memory, MemoryTag, Person, User
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_access_token(creds.credentials) if creds else None
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tu sesión ha caducado. Vuelve a iniciar sesión.")
    return user


def visible_to(user: User):
    """Regla de privacidad de Remember, en una sola condición:
    ves un recuerdo si lo creaste tú o si estás etiquetado en él con tu cuenta vinculada
    (esto último se activa en la parte 2, cuando se abre tu cofre)."""
    tagged_me = exists().where(
        MemoryTag.memory_id == Memory.id,
        MemoryTag.person_id == Person.id,
        Person.linked_user_id == user.id,
    )
    return or_(Memory.author_id == user.id, tagged_me)


def get_visible_memory(memory_id: int, user: User, db: Session) -> Memory:
    """404 (no 403) si no puedes verlo: ni siquiera revelamos que existe."""
    memory = db.scalar(select(Memory).where(Memory.id == memory_id, visible_to(user)))
    if not memory:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recuerdo no encontrado.")
    return memory


def get_own_person(person_id: int, user: User, db: Session) -> Person:
    person = db.get(Person, person_id)
    if not person or person.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Persona no encontrada.")
    return person
