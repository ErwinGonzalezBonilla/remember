"""Personas: tu lista de gente importante. Cada una tiene su cofre de recuerdos."""
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_own_person
from ..models import Memory, MemoryTag, Person, User
from ..schemas import PersonIn, PersonOut
from ..storage import save_media

router = APIRouter(prefix="/api/people", tags=["personas"])


def _stats(db: Session, person_ids: list[int]) -> dict[int, tuple[int, object]]:
    if not person_ids:
        return {}
    rows = db.execute(
        select(MemoryTag.person_id, func.count(MemoryTag.id), func.max(Memory.created_at, type_=Memory.created_at.type))
        .join(Memory, Memory.id == MemoryTag.memory_id)
        .where(MemoryTag.person_id.in_(person_ids))
        .group_by(MemoryTag.person_id)
    ).all()
    return {pid: (count, last) for pid, count, last in rows}


def serialize(p: Person, stats: dict) -> PersonOut:
    count, last = stats.get(p.id, (0, None))
    return PersonOut(
        id=p.id, name=p.name, relation=p.relation, photo_url=p.photo_url, birth_date=p.birth_date,
        special_date=p.special_date, special_label=p.special_label, note=p.note,
        is_linked=p.linked_user_id is not None, memory_count=count, last_memory_at=last, created_at=p.created_at,
    )


def _clean(data: PersonIn) -> dict:
    d = data.model_dump()
    d["name"] = d["name"].strip()
    for k in ("special_label", "note"):
        d[k] = (d[k] or "").strip() or None
    return d


@router.get("", response_model=list[PersonOut])
def list_people(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    people = db.scalars(select(Person).where(Person.owner_id == user.id)).all()
    stats = _stats(db, [p.id for p in people])
    # Primero con quien más has guardado últimamente
    out = [serialize(p, stats) for p in people]
    out.sort(key=lambda p: (p.last_memory_at is None, -(p.last_memory_at.timestamp() if p.last_memory_at else 0),
                            p.name.lower()))
    return out


@router.post("", response_model=PersonOut, status_code=201)
def create_person(data: PersonIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = Person(owner_id=user.id, **_clean(data))
    db.add(person)
    db.commit()
    return serialize(person, {})


@router.get("/{person_id}", response_model=PersonOut)
def get_person(person_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = get_own_person(person_id, user, db)
    return serialize(person, _stats(db, [person.id]))


@router.put("/{person_id}", response_model=PersonOut)
def update_person(person_id: int, data: PersonIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    person = get_own_person(person_id, user, db)
    for k, v in _clean(data).items():
        setattr(person, k, v)
    db.commit()
    return serialize(person, _stats(db, [person.id]))


@router.post("/{person_id}/photo", response_model=PersonOut)
async def upload_photo(person_id: int, file: UploadFile = File(...), user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    person = get_own_person(person_id, user, db)
    person.photo_url = await save_media(file, "photo", f"u{user.id}")
    db.commit()
    return serialize(person, _stats(db, [person.id]))


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Borra a la persona de tu lista. Los recuerdos NO se borran: solo pierden esa etiqueta."""
    person = get_own_person(person_id, user, db)
    db.delete(person)
    db.commit()
