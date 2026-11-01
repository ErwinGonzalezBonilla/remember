from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..mailer import first_name, send_email
from ..database import get_db
from ..models import PasswordReset, User
from ..schemas import ForgotIn, LoginIn, RegisterIn, ResetIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, hash_token, new_reset_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_response(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con este correo.")
    user = User(full_name=data.full_name.strip(), email=email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    send_email(
        user.email, "Bienvenido a REHOMI", f"¡Hola, {first_name(user.full_name)}! Bienvenido a REHOMI",
        ["Ya tienes tu espacio privado para guardar los recuerdos con las personas que importan.",
         "Empieza añadiendo a tu primera persona y guarda una foto, un audio o una nota. "
         "Cuando esa persona se una a REHOMI y os conectéis, su cofre se abrirá."],
        button=("Guardar mi primer recuerdo", settings.public_url),
    )
    return _token_response(user)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    # Mensaje genérico a propósito: no revelamos si el correo está registrado.
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos.")
    return _token_response(user)


@router.post("/forgot-password")
def forgot_password(data: ForgotIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user:
        token, token_hash = new_reset_token()
        db.add(PasswordReset(
            user_id=user.id, token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        db.commit()
        link = f"{settings.public_url}/restablecer/{token}"
        send_email(
            user.email, "Crea una nueva contraseña", "Recupera el acceso a tu cuenta",
            [f"Hola, {first_name(user.full_name)}. Recibimos una solicitud para cambiar la contraseña de tu cuenta de REHOMI.",
             "El enlace es válido durante <b>1 hora</b> y solo se puede usar una vez."],
            button=("Crear nueva contraseña", link),
            footer="Si no fuiste tú, ignora este correo: tu contraseña no cambiará.",
        )
    return {"message": "Si el correo está registrado, recibirás un enlace para crear una nueva contraseña."}


@router.post("/reset-password", response_model=TokenOut)
def reset_password(data: ResetIn, db: Session = Depends(get_db)):
    reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == hash_token(data.token)))
    expires = reset.expires_at.replace(tzinfo=reset.expires_at.tzinfo or timezone.utc) if reset else None
    if not reset or reset.used or expires < datetime.now(timezone.utc):
        raise HTTPException(400, "El enlace no es válido o ha caducado. Solicita uno nuevo.")
    user = db.get(User, reset.user_id)
    user.password_hash = hash_password(data.password)
    reset.used = True
    db.commit()
    return _token_response(user)
