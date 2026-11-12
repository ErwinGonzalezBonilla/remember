"""Subida directa de archivos desde el móvil.

1. POST /api/uploads {kind, content_type, size} → {key, upload_url, headers}
2. El móvil hace PUT del archivo a upload_url con esas cabeceras.
3. Envía la clave como `media_key` al crear el recuerdo, la foto, el avatar o la cápsula.

Con R2, upload_url es una URL PUT firmada de R2 (15 min) y el archivo no pasa por el servidor.
Sin R2 (en local, en los tests o en Vercel antes de configurar R2), upload_url es
PUT /api/uploads/local/{token}: un token firmado con SECRET_KEY que caduca en 15 min. Ese endpoint
guarda como siempre (Vercel Blob o disco) y responde con la clave definitiva.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import r2
from ..config import settings
from ..deps import get_current_user
from ..models import User
from ..storage import ALLOWED, EXT, store_bytes, too_big_message, upload_limit_mb

router = APIRouter(prefix="/api", tags=["subidas"])

TOKEN_MINUTES = 15
PURPOSE = "upload"


class UploadIn(BaseModel):
    kind: Literal["photo", "video", "audio"]
    content_type: str = Field(max_length=100)
    size: int = Field(gt=0)


class UploadOut(BaseModel):
    key: str | None          # None sin R2 ni disco (Vercel Blob): la da la respuesta del PUT
    upload_url: str
    headers: dict[str, str]


@router.post("/uploads", response_model=UploadOut)
def request_upload(data: UploadIn, user: User = Depends(get_current_user)):
    ct = data.content_type.split(";")[0].strip().lower()
    if ct not in ALLOWED[data.kind]:
        raise HTTPException(422, f"Formato no permitido para {data.kind}: {ct or 'desconocido'}.")
    limit = upload_limit_mb(data.kind) * 1024 * 1024
    if data.size > limit:
        raise HTTPException(413, too_big_message(data.kind, data.size))

    now = datetime.now(timezone.utc)
    path = f"u{user.id}/{now:%Y/%m}/{secrets.token_hex(12)}{EXT.get(ct, '')}"
    headers = {"Content-Type": ct}
    if settings.uses_r2:
        return UploadOut(key=r2.PREFIX + path, upload_url=r2.signed_put(path, ct), headers=headers)

    token = jwt.encode({"purpose": PURPOSE, "sub": str(user.id), "path": path, "ct": ct, "kind": data.kind,
                        "max": limit, "exp": now + timedelta(minutes=TOKEN_MINUTES)},
                       settings.secret_key, algorithm="HS256")
    on_disk = not (settings.uses_blob or settings.cloudinary_url)
    return UploadOut(key=f"/uploads/{path}" if on_disk else None,
                     upload_url=f"/api/uploads/local/{token}", headers=headers)


@router.put("/uploads/local/{token}")
async def local_upload(token: str, request: Request):
    """Recibe el archivo cuando no hay R2. El token autoriza: no hace falta la sesión."""
    try:
        t = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        if t.get("purpose") != PURPOSE:
            raise jwt.InvalidTokenError()
    except jwt.PyJWTError:
        raise HTTPException(403, "El enlace de subida no es válido o ha caducado. Vuelve a intentarlo.")
    ct = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if ct != t["ct"]:
        raise HTTPException(422, "El tipo del archivo no coincide con el que se pidió.")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > t["max"]:
            raise HTTPException(413, too_big_message(t["kind"], len(data)))
    if not data:
        raise HTTPException(422, "El archivo está vacío.")
    return {"key": await store_bytes(bytes(data), ct, t["kind"], t["path"])}
