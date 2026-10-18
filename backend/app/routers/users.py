from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Comment, Memory, Person, Reaction, User
from ..schemas import ChangePasswordIn, UserOut, UserUpdate
from ..security import hash_password, verify_password
from ..storage import save_media

router = APIRouter(prefix="/api/me", tags=["usuario"])


@router.get("", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("", response_model=UserOut)
def update_me(data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.full_name = data.full_name.strip()
    user.bio = (data.bio or "").strip() or None
    user.birth_date = data.birth_date
    db.commit()
    return user


@router.post("/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    user.avatar_url = await save_media(file, "photo", f"u{user.id}")
    db.commit()
    return user


@router.delete("/avatar", response_model=UserOut)
def remove_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.avatar_url = None
    db.commit()
    return user


@router.post("/password")
def change_password(data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(400, "La contraseña actual no es correcta.")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Contraseña actualizada."}


@router.delete("", status_code=204)
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Elimina la cuenta y todo lo suyo: recuerdos, personas, comentarios y reacciones.
    Si estaba vinculada al cofre de otra persona, ese cofre vuelve a quedar 'sin conectar'."""
    db.execute(delete(Reaction).where(Reaction.user_id == user.id))
    db.execute(delete(Comment).where(Comment.author_id == user.id))
    for memory in db.scalars(select(Memory).where(Memory.author_id == user.id)):
        db.delete(memory)
    db.execute(update(Person).where(Person.linked_user_id == user.id).values(linked_user_id=None))
    db.flush()
    db.delete(user)  # sus personas se borran en cascada
    db.commit()
