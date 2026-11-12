"""Cloudflare R2 (compatible con S3) con nuestra propia firma SigV4, sin boto3.

- URLs GET firmadas para mostrar archivos privados. Se firman con la hora redondeada a la hora en
  punto: la URL es la misma durante esa hora, así que el navegador puede guardar la foto en caché.
  Cada URL es válida al menos R2_URL_TTL segundos.
- URLs PUT firmadas (15 min) para que el móvil suba directamente a R2.
- HEAD firmado (con httpx) para comprobar que un archivo subido existe, su tamaño y su tipo.

El firmado es un cálculo local (HMAC-SHA256): no hace ninguna llamada de red.
Referencia: AWS Signature Version 4, "query string authentication" (la misma que usa botocore
para generate_presigned_url; un test compara las dos firmas).
"""
import hashlib
import hmac
from datetime import datetime, timezone
from urllib.parse import quote

from .config import settings

PREFIX = "r2:"
REGION = "auto"
SERVICE = "s3"
ALGORITHM = "AWS4-HMAC-SHA256"
PUT_TTL = 15 * 60
SIGN_WINDOW = 3600  # las URLs GET se firman con la hora redondeada a la hora en punto


def host() -> str:
    return f"{settings.r2_account_id}.r2.cloudflarestorage.com"


def _enc(value: str, safe: str = "-_.~") -> str:
    return quote(value, safe=safe)


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def presign(method: str, key: str, expires: int, now: datetime | None = None,
            headers: dict[str, str] | None = None) -> str:
    """URL firmada (path-style: https://<cuenta>.r2.cloudflarestorage.com/<bucket>/<clave>)."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    day = amz_date[:8]
    scope = f"{day}/{REGION}/{SERVICE}/aws4_request"

    signed = {"host": host(), **{k.lower(): v.strip() for k, v in (headers or {}).items()}}
    names = sorted(signed)
    signed_headers = ";".join(names)
    canonical_headers = "".join(f"{n}:{signed[n]}\n" for n in names)

    path = f"/{settings.r2_bucket}/{key}"
    canonical_uri = _enc(path, safe="/-_.~")
    query = {
        "X-Amz-Algorithm": ALGORITHM,
        "X-Amz-Credential": f"{settings.r2_access_key_id}/{scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(expires),
        "X-Amz-SignedHeaders": signed_headers,
    }
    canonical_query = "&".join(f"{_enc(k)}={_enc(v)}" for k, v in sorted(query.items()))
    canonical_request = "\n".join(
        [method, canonical_uri, canonical_query, canonical_headers, signed_headers, "UNSIGNED-PAYLOAD"])
    string_to_sign = "\n".join(
        [ALGORITHM, amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()])

    k = _hmac(f"AWS4{settings.r2_secret_access_key}".encode(), day)
    k = _hmac(_hmac(_hmac(k, REGION), SERVICE), "aws4_request")
    signature = hmac.new(k, string_to_sign.encode(), hashlib.sha256).hexdigest()
    return f"https://{host()}{canonical_uri}?{canonical_query}&X-Amz-Signature={signature}"


def signed_get(key: str, now: datetime | None = None) -> str:
    """URL para ver un archivo. Estable durante la hora en curso y válida al menos R2_URL_TTL."""
    now = now or datetime.now(timezone.utc)
    start = datetime.fromtimestamp(int(now.timestamp()) // SIGN_WINDOW * SIGN_WINDOW, timezone.utc)
    return presign("GET", key, settings.r2_url_ttl + SIGN_WINDOW, now=start)


def signed_put(key: str, content_type: str) -> str:
    """URL para subir un archivo (15 min). El Content-Type queda firmado: hay que enviar el mismo."""
    return presign("PUT", key, PUT_TTL, headers={"content-type": content_type})


def head(key: str) -> tuple[int, str] | None:
    """(tamaño, tipo) del archivo en R2, o None si no existe."""
    import httpx

    r = httpx.head(presign("HEAD", key, 60), timeout=10)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return int(r.headers.get("content-length", 0)), r.headers.get("content-type", "").split(";")[0].strip()


def put(key: str, data: bytes, content_type: str):
    """Sube un archivo desde el servidor (script de migración)."""
    import httpx

    r = httpx.put(signed_put(key, content_type), content=data, headers={"Content-Type": content_type}, timeout=120)
    r.raise_for_status()


def sign_media(value: str | None) -> str | None:
    """Lo que ve el cliente: las claves "r2:…" se convierten en una URL firmada; el resto (URLs antiguas
    de Vercel Blob, Cloudinary o /uploads locales) sale tal cual."""
    if value and value.startswith(PREFIX) and settings.uses_r2:
        return signed_get(value[len(PREFIX):])
    return value
