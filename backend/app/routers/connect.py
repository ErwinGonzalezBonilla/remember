"""Conectar (parte 2): buscar a alguien por @usuario o correo, enviar solicitud, aceptarla
vinculándola con una persona de tu lista y, al aceptar, abrir su cofre.

Ejemplo: Allison busca a @felixflores, dice que es su padre y envía la solicitud.
Félix la acepta, dice que Allison es su hija y la vincula con la "Allison" que ya tenía guardada.
Desde ese momento Allison ve todo lo que Félix etiquetó con ella (regla en deps.visible_to)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_own_person
from ..models import ConnectionRequest, Memory, MemoryTag, Person, User
from ..schemas import AcceptIn, OpenedOut, PublicUser, RequestIn, RequestOut, RequestsOut

router = APIRouter(prefix="/api/connect", tags=["conectar"])


def public(u: User) -> PublicUser:
    return PublicUser(id=u.id, full_name=u.full_name, username=u.username, avatar_url=u.avatar_url)


def out(r: ConnectionRequest) -> RequestOut:
    return RequestOut(id=r.id, status=r.status, relation=r.relation, created_at=r.created_at,
                      from_user=public(r.from_user), to_user=public(r.to_user))


def _linked_person(owner_id: int, other_id: int, db: Session) -> Person | None:
    return db.scalar(select(Person).where(Person.owner_id == owner_id, Person.linked_user_id == other_id))


def shared_count(author_id: int, viewer_id: int, db: Session) -> int:
    """Cuántos recuerdos de `author` puede ver `viewer` por estar etiquetado en ellos."""
    return db.scalar(
        select(func.count(func.distinct(Memory.id)))
        .join(MemoryTag, MemoryTag.memory_id == Memory.id)
        .join(Person, Person.id == MemoryTag.person_id)
        .where(Memory.author_id == author_id, Person.owner_id == author_id, Person.linked_user_id == viewer_id)
    ) or 0


@router.get("/lookup", response_model=PublicUser)
def lookup(q: str = Query(..., min_length=3), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Búsqueda EXACTA por @usuario o correo: nadie puede ir buscando nombres y ver quién está en la app."""
    term = q.strip().lower()
    if "@" in term and not term.startswith("@"):
        found = db.scalar(select(User).where(User.email == term))
    else:
        found = db.scalar(select(User).where(User.username == term.lstrip("@")))
    if not found:
        raise HTTPException(404, "No encontramos a nadie con ese @usuario o correo. Revisa que esté bien escrito.")
    if found.id == user.id:
        raise HTTPException(400, "Ese eres tú 🙂")
    return public(found)


@router.get("/requests", response_model=RequestsOut)
def list_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    def q(*cond):
        return [out(r) for r in db.scalars(
            select(ConnectionRequest).where(*cond).order_by(ConnectionRequest.created_at.desc()))]
    return RequestsOut(
        incoming=q(ConnectionRequest.to_user_id == user.id, ConnectionRequest.status == "pending"),
        outgoing=q(ConnectionRequest.from_user_id == user.id, ConnectionRequest.status == "pending"),
        opened=q(ConnectionRequest.from_user_id == user.id, ConnectionRequest.status == "accepted",
                 ConnectionRequest.seen_by_sender.is_(False)),
    )


@router.post("/requests", response_model=RequestOut, status_code=201)
def send_request(data: RequestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.to_user_id == user.id:
        raise HTTPException(400, "No puedes conectarte contigo mismo.")
    other = db.get(User, data.to_user_id)
    if not other:
        raise HTTPException(404, "Usuario no encontrado.")
    if _linked_person(user.id, other.id, db):
        raise HTTPException(409, f"Ya estás conectado con {other.full_name}.")
    pending = db.scalar(select(ConnectionRequest).where(
        ConnectionRequest.status == "pending",
        or_(and_(ConnectionRequest.from_user_id == user.id, ConnectionRequest.to_user_id == other.id),
            and_(ConnectionRequest.from_user_id == other.id, ConnectionRequest.to_user_id == user.id))))
    if pending:
        if pending.from_user_id == user.id:
            raise HTTPException(409, f"Ya enviaste una solicitud a {other.full_name}. Espera a que la acepte.")
        raise HTTPException(409, f"{other.full_name} ya te envió una solicitud: acéptala desde Personas.")
    if data.person_id is not None:
        person = get_own_person(data.person_id, user, db)
        if person.linked_user_id:
            raise HTTPException(409, "Esa persona de tu lista ya está conectada con otra cuenta.")
    req = ConnectionRequest(from_user_id=user.id, to_user_id=other.id, relation=data.relation,
                            from_person_id=data.person_id)
    db.add(req)
    db.commit()
    db.refresh(req)
    return out(req)


def _incoming(request_id: int, user: User, db: Session) -> ConnectionRequest:
    req = db.get(ConnectionRequest, request_id)
    if not req or req.to_user_id != user.id or req.status != "pending":
        raise HTTPException(404, "Solicitud no encontrada o ya respondida.")
    return req


@router.get("/requests/{request_id}", response_model=RequestOut)
def get_request(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = db.get(ConnectionRequest, request_id)
    if not req or user.id not in (req.from_user_id, req.to_user_id):
        raise HTTPException(404, "Solicitud no encontrada.")
    return out(req)


@router.post("/requests/{request_id}/accept", response_model=OpenedOut)
def accept(request_id: int, data: AcceptIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Quien recibe elige quién es para él y con qué persona de su lista la vincula: su cofre se abre."""
    req = _incoming(request_id, user, db)
    sender = req.from_user
    if _linked_person(user.id, sender.id, db):
        raise HTTPException(409, f"Ya estás conectado con {sender.full_name}.")

    # Mi lado: vincular a una persona que ya tenía (su cofre) o crear una nueva
    if data.person_id is not None:
        mine = get_own_person(data.person_id, user, db)
        if mine.linked_user_id:
            raise HTTPException(409, "Esa persona ya está conectada con otra cuenta.")
        mine.relation = data.relation
    else:
        mine = Person(owner_id=user.id, name=sender.full_name, relation=data.relation, photo_url=sender.avatar_url)
        db.add(mine)
    mine.linked_user_id = sender.id

    # Su lado: la persona que eligió al enviar, o una nueva conmigo
    theirs = db.get(Person, req.from_person_id) if req.from_person_id else None
    if not theirs or theirs.owner_id != sender.id or theirs.linked_user_id:
        theirs = Person(owner_id=sender.id, name=user.full_name, relation=req.relation, photo_url=user.avatar_url)
        db.add(theirs)
    theirs.linked_user_id = user.id

    req.status = "accepted"
    req.responded_at = datetime.now(timezone.utc)
    db.commit()
    return OpenedOut(request=out(req), shared_count=shared_count(user.id, sender.id, db), person_id=mine.id)


@router.post("/requests/{request_id}/reject", status_code=204)
def reject(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = _incoming(request_id, user, db)
    req.status = "rejected"
    req.responded_at = datetime.now(timezone.utc)
    db.commit()


@router.delete("/requests/{request_id}", status_code=204)
def cancel(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = db.get(ConnectionRequest, request_id)
    if not req or req.from_user_id != user.id or req.status != "pending":
        raise HTTPException(404, "Solicitud no encontrada.")
    db.delete(req)
    db.commit()


@router.get("/opened/{request_id}", response_model=OpenedOut)
def opened(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Para quien envió la solicitud: '¡Tu cofre se ha abierto!'. Lo marca como visto."""
    req = db.get(ConnectionRequest, request_id)
    if not req or req.from_user_id != user.id or req.status != "accepted":
        raise HTTPException(404, "No hay ningún cofre que abrir aquí.")
    req.seen_by_sender = True
    db.commit()
    mine = _linked_person(user.id, req.to_user_id, db)
    return OpenedOut(request=out(req), shared_count=shared_count(req.to_user_id, user.id, db),
                     person_id=mine.id if mine else None)
