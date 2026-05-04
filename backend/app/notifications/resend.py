"""Dünner HTTP-Wrapper um die Resend-API.

Eine Funktion: send(). Im Dev-Modus (kein API-Key gesetzt) wird die
Mail strukturiert geloggt statt versendet, damit Domain-Verifizierung
parallel laufen kann, ohne den Refactor zu blockieren.

Fehler werden geloggt, aber nicht weitergereicht – kein
Mail-Versand-Fehler darf eine User-Aktion blockieren.
"""
import logging
from typing import Optional

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def send(
    to: str,
    subject: str,
    html: str,
    text: str,
    reply_to: Optional[str] = None,
) -> bool:
    settings = get_settings()

    if settings.email_dev_mode:
        log.info(
            "[email-dev-mode] to=%s subject=%r reply_to=%s\n--- text ---\n%s",
            to, subject, reply_to or settings.resend_reply_to or "-", text,
        )
        return True

    payload: dict = {
        "from": settings.resend_from_email,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    rt = reply_to or settings.resend_reply_to
    if rt:
        payload["reply_to"] = rt

    try:
        r = httpx.post(
            RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json=payload,
            timeout=10.0,
        )
        if r.status_code >= 300:
            log.error("Resend Fehler %s: %s", r.status_code, r.text)
            return False
        return True
    except Exception:  # noqa: BLE001
        log.exception("Resend-Aufruf fehlgeschlagen")
        return False
