"""Dünner HTTP-Wrapper um die Resend-API.

send() liefert ein SendResult-Objekt mit allen Diagnose-Infos
(message_id, status, Fehlerdetails). So kann der Test-Endpoint die
Resend-Antwort direkt durchreichen, und der normale Fire-and-forget-
Pfad nutzt einfach `result.ok`.

Im Dev-Modus (RESEND_API_KEY leer) wird die Mail strukturiert geloggt
statt versendet. Fehler werden geloggt, aber nicht weitergereicht –
ein Mail-Versand-Fehler darf eine User-Aktion nicht blockieren.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


@dataclass
class SendResult:
    ok: bool
    dev_mode: bool = False
    message_id: Optional[str] = None
    status_code: Optional[int] = None
    error_name: Optional[str] = None
    error_message: Optional[str] = None
    raw_response: Optional[str] = None


def _normalize_from(addr: str) -> str:
    """Akzeptiert in der Konfiguration drei Schreibweisen:
      - "clok@send.f-lv.de"           (reine Adresse)
      - "Clok <clok@send.f-lv.de>"    (RFC 5322-konform)
      - "Clok clok@send.f-lv.de"      (Excel-/Copy-Paste-Variante)
    und wandelt die letzte in das mittlere Format um, weil Resend
    nur die ersten beiden akzeptiert.
    """
    addr = addr.strip()
    if not addr or "<" in addr or " " not in addr:
        return addr
    name, _, email = addr.rpartition(" ")
    if "@" in email and name:
        return f"{name.strip()} <{email.strip()}>"
    return addr


def send(
    to: str,
    subject: str,
    html: str,
    text: str,
    reply_to: Optional[str] = None,
) -> SendResult:
    settings = get_settings()

    if settings.email_dev_mode:
        log.info(
            "[email-dev-mode] to=%s subject=%r reply_to=%s\n--- text ---\n%s",
            to, subject, reply_to or settings.resend_reply_to or "-", text,
        )
        return SendResult(ok=True, dev_mode=True)

    from_addr = _normalize_from(settings.resend_from_email)
    if from_addr != settings.resend_from_email:
        log.info(
            "RESEND_FROM_EMAIL normalisiert: %r -> %r",
            settings.resend_from_email, from_addr,
        )

    payload: dict = {
        "from": from_addr,
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
    except Exception as exc:  # noqa: BLE001
        log.exception("Resend-Aufruf fehlgeschlagen (Netzwerk/Timeout)")
        return SendResult(
            ok=False,
            error_name="network_error",
            error_message=str(exc),
        )

    if r.status_code >= 300:
        # Resend liefert {"name": "...", "message": "...", "statusCode": N}
        body_text = r.text
        try:
            body = r.json()
        except (ValueError, json.JSONDecodeError):
            body = {}
        name = body.get("name") or "unknown"
        message = body.get("message") or body_text
        log.error(
            "Resend %d %s: %s | full body: %s | request payload to=%s subject=%r from=%s",
            r.status_code, name, message, body_text, to, subject,
            settings.resend_from_email,
        )
        return SendResult(
            ok=False,
            status_code=r.status_code,
            error_name=name,
            error_message=message,
            raw_response=body_text,
        )

    # Success
    try:
        body = r.json()
    except (ValueError, json.JSONDecodeError):
        body = {}
    message_id = body.get("id")
    log.info("Resend ok message_id=%s to=%s subject=%r", message_id, to, subject)
    return SendResult(
        ok=True,
        status_code=r.status_code,
        message_id=message_id,
    )
