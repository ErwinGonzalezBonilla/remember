"""Personas: tu lista de gente importante. Cada una tiene su cofre de recuerdos."""
from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .capsules import detach_person
from ..database import get_db
from ..deps import get_current_user, get_own_person
from ..models import Memory, MemoryTag, Person, User
from ..schemas import AboutFamily, AboutMember, AboutOut, Family, PersonIn, PersonOut, SeenAs
from ..storage import media_from

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
        id=p.id, name=p.name, relation=p.relation, relation_label=p.relation_label,
        nickname=p.nickname, nickname_emoji=p.nickname_emoji, photo_url=p.photo_url, birth_date=p.birth_date,
        special_date=p.special_date, special_label=p.special_label, note=p.note,
        is_linked=p.linked_user_id is not None, memory_count=count, last_memory_at=last, created_at=p.created_at,
    )


def _clean(data: PersonIn) -> dict:
    d = data.model_dump()
    d["name"] = d["name"].strip()
    for k in ("special_label", "note", "relation_label", "nickname", "nickname_emoji"):
        d[k] = (d[k] or "").strip() or None
    if d["relation"] != "otro":
        d["relation_label"] = None
    if not d["nickname"]:
        d["nickname_emoji"] = None
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
    out = serialize(person, _stats(db, [person.id]))
    out.seen_as = seen_as(person.linked_user_id, user.id, db)
    if person.linked_user_id:
        other = db.get(User, person.linked_user_id)
        if other:
            out.about = about(other, user, db)
    return out


def about(owner: User, viewer: User, db: Session) -> AboutOut:
    """Perfil de `owner` visto por `viewer`. Si un familiar de owner está enlazado a una cuenta con la que
    viewer también está conectado, se enlaza al cofre que viewer tiene de esa persona."""
    family = Family.model_validate(owner.family or {})
    ids = {m.person_id for ms in (family.parents, family.siblings, family.children) for m in ms if m.person_id}
    if owner.partner_person_id:
        ids.add(owner.partner_person_id)
    linked = dict(db.execute(select(Person.id, Person.linked_user_id)
                             .where(Person.id.in_(ids), Person.owner_id == owner.id)).all()) if ids else {}
    users = {uid for uid in linked.values() if uid}
    mine = dict(db.execute(select(Person.linked_user_id, Person.id)
                           .where(Person.owner_id == viewer.id, Person.linked_user_id.in_(users))).all()) if users else {}

    def member(name: str, pid: int | None) -> AboutMember:
        uid = linked.get(pid)
        return AboutMember(name=name, is_you=uid == viewer.id, person_id=mine.get(uid) if uid else None)

    has_family = family.parents or family.siblings or family.children
    return AboutOut(
        full_name=owner.full_name, username=owner.username, avatar_url=owner.avatar_url, birth_date=owner.birth_date,
        bio=owner.bio, relationship_status=owner.relationship_status,
        partner=member(owner.partner_name, owner.partner_person_id) if owner.partner_name else None,
        family=AboutFamily(**{k: [member(m.name, m.person_id) for m in getattr(family, k)]
                              for k in ("parents", "siblings", "children")}) if has_family else None,
    )


def seen_as(owner_id: int | None, viewer_id: int, db: Session) -> SeenAs | None:
    """Cómo tiene guardado `owner` a `viewer` (relación y apodo). Solo existe si están conectados."""
    if not owner_id:
        return None
    theirs = db.scalar(select(Person).where(Person.owner_id == owner_id, Person.linked_user_id == viewer_id))
    if not theirs:
        return None
    owner = db.get(User, owner_id)
    return SeenAs(name=owner.full_name, relation=theirs.relation, relation_label=theirs.relation_label,
                  nickname=theirs.nickname, nickname_emoji=theirs.nickname_emoji)


@router.put("/{person_id}", response_model=PersonOut)
def update_person(person_id: int, data: PersonIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    person = get_own_person(person_id, user, db)
    for k, v in _clean(data).items():
        setattr(person, k, v)
    db.commit()
    return serialize(person, _stats(db, [person.id]))


@router.post("/{person_id}/photo", response_model=PersonOut)
async def upload_photo(person_id: int, file: UploadFile | None = File(None), media_key: str | None = Form(None),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    person = get_own_person(person_id, user, db)
    person.photo_url = await media_from(file, media_key, user.id, "photo", f"u{user.id}")
    db.commit()
    return serialize(person, _stats(db, [person.id]))


@router.post("/{person_id}/unlink", response_model=PersonOut)
def unlink(person_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Desconectar: ninguno de los dos vuelve a ver lo que el otro etiquetó. Los recuerdos no se borran."""
    person = get_own_person(person_id, user, db)
    other_id = person.linked_user_id
    if other_id:
        person.linked_user_id = None
        for theirs in db.scalars(select(Person).where(Person.owner_id == other_id, Person.linked_user_id == user.id)):
            theirs.linked_user_id = None
        db.commit()
    return serialize(person, _stats(db, [person.id]))


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Borra a la persona de tu lista. Los recuerdos NO se borran: solo pierden esa etiqueta."""
    person = get_own_person(person_id, user, db)
    detach_person(person, db)
    db.delete(person)
    db.commit()
