"""Guardado de multimedia con límites de tamaño y formato.

Con R2 configurado (settings.uses_r2), el móvil sube directamente a R2 con una URL firmada
(ver routers/uploads.py) y aquí solo se comprueba la clave ("r2:<clave>") con resolve_media_key().
Sin R2, se guarda como siempre: Vercel Blob (si el proyecto tiene un store conectado) →
Cloudinary (CLOUDINARY_URL) → disco local (/uploads).
"""
import secrets
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile

from . import r2
from .config import settings

ALLOWED = {
    "photo": {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"},
    "video": {"video/mp4", "video/quicktime", "video/webm"},
    "audio": {"audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav",
              "audio/x-wav", "audio/webm", "audio/ogg"},
}
EXT = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif",
    "image/gif": ".gif", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
    "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac",
    "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/webm": ".weba", "audio/ogg": ".ogg",
}
# Máximo por archivo con la subida directa (R2, o disco en local)
LIMITS_MB = {"photo": 25, "audio": 50, "video": 300}
VERCEL_MAX_MB = 4  # sin R2, en Vercel cada petición admite como mucho 4,5 MB
LABEL = {"photo": "las fotos", "audio": "las notas de voz", "video": "los videos"}


def upload_limit_mb(kind: str) -> int:
    if not settings.uses_r2 and settings.on_vercel:
        return VERCEL_MAX_MB
    return LIMITS_MB[kind]


def too_big_message(kind: str, size: int) -> str:
    limit = upload_limit_mb(kind)
    if limit == VERCEL_MAX_MB and LIMITS_MB[kind] > VERCEL_MAX_MB:
        return f"El archivo pesa {size / 1024 / 1024:.1f} MB. Por ahora el máximo es {limit} MB por archivo."
    return f"El archivo pesa {size / 1024 / 1024:.1f} MB. El máximo para {LABEL[kind]} es {limit} MB."


async def store_bytes(data: bytes, content_type: str, kind: str, path: str) -> str:
    """Guarda sin R2. `path` es "u12/2026/11/abc.jpg". Devuelve la URL o la ruta /uploads/… a guardar."""
    if settings.uses_blob:
        from vercel import blob  # paquete vercel-blob

        result = await blob.put_blob(f"rehomi/{path}", data, access="public",
                                     content_type=content_type, add_random_suffix=True)
        return result.url

    if settings.cloudinary_url:
        import os
        os.environ.setdefault("CLOUDINARY_URL", settings.cloudinary_url)  # también si viene del archivo .env
        import cloudinary.uploader

        resource_type = "image" if kind == "photo" else "video"  # Cloudinary trata el audio como video
        folder = path.rsplit("/", 1)[0]
        result = cloudinary.uploader.upload(data, folder=f"rehomi/{folder}", resource_type=resource_type,
                                            public_id=secrets.token_hex(16))
        return result["secure_url"]

    target = Path(settings.upload_dir) / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return f"/uploads/{path}"


async def save_media(file: UploadFile, kind: str, folder: str) -> str:
    """Subida antigua por FormData (pasa por el servidor). Se mantiene para no romper nada."""
    if file.content_type not in ALLOWED.get(kind, set()):
        raise HTTPException(422, f"Formato no permitido para {kind}: {file.content_type}.")

    data = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(413, f"El archivo supera el límite de {settings.max_upload_mb} MB.")
    if not data:
        raise HTTPException(422, "El archivo está vacío.")

    name = secrets.token_hex(12) + EXT.get(file.content_type, "")
    return await store_bytes(data, file.content_type, kind, f"{folder}/{name}")


def _check(kind: str, size: int, content_type: str):
    if not size:
        raise HTTPException(422, "El archivo subido está vacío.")
    if size > LIMITS_MB[kind] * 1024 * 1024:
        raise HTTPException(413, too_big_message(kind, size))
    if content_type not in ALLOWED[kind]:
        raise HTTPException(422, f"Formato no permitido para {kind}: {content_type or 'desconocido'}.")


def _own_path(path: str, user_id: int) -> str:
    if ".." in path or "//" in path or "\\" in path:
        raise HTTPException(422, "Archivo no válido.")
    if not path.startswith(f"u{user_id}/"):
        raise HTTPException(403, "Ese archivo no es tuyo.")
    return path


async def media_from(file: UploadFile | None, media_key: str | None, user_id: int, kind: str, folder: str) -> str:
    """El archivo de un formulario: ya subido (media_key, lo normal) o enviado en el propio formulario."""
    if media_key:
        from starlette.concurrency import run_in_threadpool

        return await run_in_threadpool(resolve_media_key, media_key, user_id, kind)
    if file:
        return await save_media(file, kind, folder)
    raise HTTPException(422, "Adjunta el archivo.")


def resolve_media_key(key: str, user_id: int, kind: str) -> str:
    """Comprueba un archivo ya subido (media_key) y devuelve lo que se guarda en la base de datos.
    Solo se aceptan archivos del propio usuario, que existan y con tamaño y tipo válidos."""
    key = (key or "").strip()
    if kind not in ALLOWED:
        raise HTTPException(422, "Tipo de archivo no válido.")

    if key.startswith(r2.PREFIX):
        path = _own_path(key[len(r2.PREFIX):], user_id)
        if not settings.uses_r2:
            raise HTTPException(422, "El almacén de archivos no está configurado.")
        info = r2.head(path)
        if not info:
            raise HTTPException(422, "No encontramos el archivo subido. Vuelve a intentarlo.")
        _check(kind, *info)
        return key

    if key.startswith("/uploads/"):
        path = _own_path(key[len("/uploads/"):], user_id)
        root = Path(settings.upload_dir).resolve()
        f = (root / path).resolve()
        if root not in f.parents or not f.is_file():
            raise HTTPException(422, "No encontramos el archivo subido. Vuelve a intentarlo.")
        types = {ct for ct, ext in EXT.items() if ext == f.suffix.lower()}
        _check(kind, f.stat().st_size, next(iter(types & ALLOWED[kind]), next(iter(types), "")))
        return key

    u = urlparse(key)
    if u.scheme == "https" and u.hostname and u.hostname.endswith(".blob.vercel-storage.com"):
        _own_path(u.path.removeprefix("/rehomi/"), user_id)
        import httpx

        r = httpx.head(key, timeout=10)
        if r.status_code != 200:
            raise HTTPException(422, "No encontramos el archivo subido. Vuelve a intentarlo.")
        _check(kind, int(r.headers.get("content-length", 0)), r.headers.get("content-type", "").split(";")[0].strip())
        return key

    if u.scheme == "https" and u.hostname == "res.cloudinary.com" and f"/rehomi/u{user_id}/" in u.path:
        return key  # Cloudinary (sin R2 ni Blob): la URL la acaba de devolver nuestra subida

    raise HTTPException(403 if key else 422, "Ese archivo no es tuyo." if key else "Falta el archivo.")
