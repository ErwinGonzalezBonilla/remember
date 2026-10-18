"""Guardado de multimedia con límites de tamaño y formato.
Si hay CLOUDINARY_URL se sube a Cloudinary; si no, a disco local (desarrollo)."""
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import settings

ALLOWED = {
    "photo": {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"},
    "video": {"video/mp4", "video/quicktime", "video/webm"},
    "audio": {"audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav",
              "audio/x-wav", "audio/webm", "audio/ogg"},
}
EXT = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic",
    "image/gif": ".gif", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
    "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/wav": ".wav",
    "audio/webm": ".weba", "audio/ogg": ".ogg",
}


async def save_media(file: UploadFile, kind: str, folder: str) -> str:
    if file.content_type not in ALLOWED.get(kind, set()):
        raise HTTPException(422, f"Formato no permitido para {kind}: {file.content_type}.")

    data = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(413, f"El archivo supera el límite de {settings.max_upload_mb} MB.")
    if not data:
        raise HTTPException(422, "El archivo está vacío.")

    if settings.cloudinary_url:
        import os
        os.environ.setdefault("CLOUDINARY_URL", settings.cloudinary_url)  # también si viene del archivo .env
        import cloudinary.uploader

        resource_type = "image" if kind == "photo" else "video"  # Cloudinary trata el audio como video
        # Nombre aleatorio no adivinable. Para producción: pasar a type="authenticated" + URLs firmadas.
        result = cloudinary.uploader.upload(
            data, folder=f"remember/{folder}", resource_type=resource_type,
            public_id=secrets.token_hex(16),
        )
        return result["secure_url"]

    target = Path(settings.upload_dir) / folder
    target.mkdir(parents=True, exist_ok=True)
    name = secrets.token_hex(12) + EXT.get(file.content_type, "")
    (target / name).write_bytes(data)
    return f"/uploads/{folder}/{name}"
