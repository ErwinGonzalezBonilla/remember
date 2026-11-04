"""Correos de REHOMI.
Orden: Resend (RESEND_API_KEY) → SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) → log en desarrollo.
Un fallo al enviar nunca rompe la petición: se registra y la app sigue."""
import json
import logging
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from email.utils import parseaddr
from html import escape

from .config import settings

log = logging.getLogger("rehomi.mail")

PETROL = "#0F4C5C"
CORAL = "#FF6B6B"
SAND = "#FBF6EE"
LOGO_BG = "#083D4A"  # mismo fondo que la imagen del logo


def layout(title: str, paragraphs: list[str], button: tuple[str, str] | None = None, footer: str = "") -> str:
    """Plantilla HTML común. `paragraphs` ya vienen escapados o con HTML seguro."""
    logo_url = f"{settings.origins[0]}/brand/email.png" if settings.origins else ""
    body = "".join(f'<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#17323A">{p}</p>' for p in paragraphs)
    cta = ""
    if button:
        label, url = button
        cta = (f'<p style="margin:24px 0"><a href="{escape(url)}" style="display:inline-block;background:{CORAL};'
               f'color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px">{escape(label)}</a></p>')
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:{SAND};font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{SAND};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="background:{LOGO_BG};padding:16px 20px 18px;color:#fff;font-size:22px;font-weight:800">
<img src="{escape(logo_url)}" width="240" height="80" alt="Rehomi" style="display:block;border:0;width:240px;height:auto;color:#fff;font-size:24px;font-weight:800">
<div style="font-size:11px;font-weight:600;letter-spacing:3px;opacity:.8;margin:2px 0 0 12px">CONECTA · GUARDA · SIEMPRE</div></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:{PETROL}">{escape(title)}</h1>{body}{cta}
<p style="margin:20px 0 0;font-size:13px;color:#5B7179">{footer or "Recibes este correo porque tienes una cuenta en Rehomi."}</p>
</td></tr></table></td></tr></table></body></html>"""


def _text_version(title: str, paragraphs: list[str], button: tuple[str, str] | None) -> str:
    import re
    plain = [re.sub(r"<[^>]+>", "", p) for p in paragraphs]
    out = [title, "", *plain]
    if button:
        out += ["", f"{button[0]}: {button[1]}"]
    return "\n".join(out)


def send_email(to: str, subject: str, title: str, paragraphs: list[str],
               button: tuple[str, str] | None = None, footer: str = "") -> bool:
    html = layout(title, paragraphs, button, footer)
    text = _text_version(title, paragraphs, button)
    try:
        if settings.resend_api_key:
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps({"from": settings.mail_from, "to": [to], "subject": subject,
                                 "html": html, "text": text}).encode(),
                headers={"Authorization": f"Bearer {settings.resend_api_key}", "Content-Type": "application/json",
                         "User-Agent": "rehomi/1.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as res:
                return 200 <= res.status < 300
        if settings.smtp_host and settings.smtp_user and settings.smtp_password:
            msg = EmailMessage()
            msg["From"], msg["To"], msg["Subject"] = settings.mail_from, to, subject
            msg.set_content(text)
            msg.add_alternative(html, subtype="html")
            if settings.smtp_port == 465:
                with smtplib.SMTP_SSL(settings.smtp_host, 465, context=ssl.create_default_context(), timeout=10) as s:
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
                    s.starttls(context=ssl.create_default_context())
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg)
            return True
        if settings.is_production:
            # En producción no se escriben enlaces ni contenidos en el log.
            log.error("Correo sin enviar a %s (%s): configura RESEND_API_KEY o SMTP.", parseaddr(to)[1], subject)
        else:
            # Desarrollo: sin proveedor configurado, el correo se muestra en la consola.
            log.warning("Correo (sin enviar, falta RESEND_API_KEY o SMTP) para %s · %s\n%s", to, subject, text)
        return False
    except Exception as exc:  # noqa: BLE001 - un correo fallido no debe romper la app
        log.error("No se pudo enviar el correo a %s (%s): %s", parseaddr(to)[1], subject, exc)
        return False


def first_name(full_name: str) -> str:
    return escape(full_name.split(" ")[0])
