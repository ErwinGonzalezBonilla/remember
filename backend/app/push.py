"""Avisos en el móvil (Web Push).
Las claves VAPID se crean solas la primera vez y se guardan en la base de datos: no hay nada que configurar.
Un fallo al enviar nunca rompe la petición; las suscripciones caducadas (404/410) se borran."""
import base64
import json
import logging

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import AppSetting, PushSubscription

log = logging.getLogger("rehomi.push")
CLAIMS = {"sub": "mailto:hola@rehomi.app"}
_cache: dict[str, object] = {}


def _vapid(db: Session) -> tuple[Vapid02, str]:
    if "vapid" in _cache:
        return _cache["vapid"], _cache["public"]
    row = db.get(AppSetting, "vapid_private_pem")
    if not row:
        v = Vapid02()
        v.generate_keys()
        db.add(AppSetting(key="vapid_private_pem", value=v.private_pem().decode()))
        try:
            db.commit()
        except IntegrityError:  # otra instancia la creó a la vez: usar la suya
            db.rollback()
        row = db.get(AppSetting, "vapid_private_pem")
    v = Vapid02.from_pem(row.value.encode())
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    public = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    _cache.update(vapid=v, public=public)
    return v, public


def public_key(db: Session) -> str:
    return _vapid(db)[1]


def send_push(db: Session, user_ids, title: str, body: str, url: str = "/", tag: str | None = None) -> int:
    """Envía el aviso a todos los móviles de esos usuarios. Devuelve cuántos se entregaron."""
    ids = {u for u in user_ids if u}
    if not ids:
        return 0
    subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id.in_(ids))).all()
    if not subs:
        return 0
    vapid, _ = _vapid(db)
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    sent, dead = 0, []
    for s in subs:
        try:
            webpush({"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}}, data=payload,
                    vapid_private_key=vapid, vapid_claims=dict(CLAIMS), ttl=86400, timeout=5)
            sent += 1
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):
                dead.append(s)
            else:
                log.warning("Aviso no entregado (%s): %s", status, exc)
        except Exception as exc:  # noqa: BLE001 - un aviso fallido no debe romper la app
            log.warning("Aviso no entregado: %s", exc)
    for s in dead:
        db.delete(s)
    if dead:
        db.commit()
    return sent
