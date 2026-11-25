"""Lugar de un recuerdo → coordenadas, con Nominatim de OpenStreetMap.

Política de uso de Nominatim: User-Agent propio que identifique la app, como mucho 1 petición por segundo y guardar
los resultados. Aquí: caché en memoria por texto, espera mínima entre peticiones y un tiempo límite corto.
Nunca rompe el guardado: si falla (sin red, sin resultados, límite), devuelve None y el recuerdo queda sin punto.
Se desactiva con GEOCODING=false (tests y desarrollo sin red).
"""
import logging
import threading
import time

import httpx

from .config import settings

log = logging.getLogger("rehomi.geocode")
URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Rehomi/1.0 (+https://rehomi.app)"
TIMEOUT = 4.0
MIN_INTERVAL = 1.1          # segundos entre peticiones
_cache: dict[str, tuple[float, float] | None] = {}
_lock = threading.Lock()
_last = 0.0


def _query(text: str) -> tuple[float, float] | None:
    r = httpx.get(URL, params={"q": text, "format": "jsonv2", "limit": 1, "accept-language": "es"},
                  headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    r.raise_for_status()
    rows = r.json()
    if not rows:
        return None
    lat, lng = float(rows[0]["lat"]), float(rows[0]["lon"])
    return (lat, lng) if -90 <= lat <= 90 and -180 <= lng <= 180 else None


def geocode(text: str | None) -> tuple[float, float] | None:
    """(lat, lng) del lugar, o None. Bloquea como mucho unos segundos: llamar desde un hilo (no desde async)."""
    global _last
    key = " ".join((text or "").split()).lower()
    if not key or not settings.geocoding:
        return None
    if key in _cache:
        return _cache[key]
    with _lock:
        wait = MIN_INTERVAL - (time.monotonic() - _last)
        if wait > 0:
            time.sleep(wait)
        _last = time.monotonic()
        try:
            result = _query(text.strip())
        except Exception as exc:  # noqa: BLE001 - sin red o error del servicio: el recuerdo se guarda sin punto
            log.warning("No se pudo localizar «%s»: %s", text, exc)
            return None   # sin guardar en caché: se volverá a intentar al editar
    _cache[key] = result
    return result
