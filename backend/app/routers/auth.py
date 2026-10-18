import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import PasswordReset, User
from ..schemas import ForgotIn, LoginIn, RegisterIn, ResetIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, hash_token, new_reset_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger("remember.auth")


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
        # TODO: enviar por email (Resend, SendGrid o un flujo de n8n). En desarrollo se imprime en consola.
        log.warning("Enlace de recuperación para %s: %s", user.email, link)
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
