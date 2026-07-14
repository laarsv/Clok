"""Dünner HTTP-Wrapper um die Brevo Transactional-Email-API.

send() liefert ein SendResult mit allen Diagnose-Infos (message_id, status,
Fehlerdetails). So kann der Test-Endpoint die Antwort direkt durchreichen, und
der normale Fire-and-forget-Pfad nutzt einfach `result.ok`.

Im Dev-Modus (BREVO_API_KEY leer) wird die Mail strukturiert geloggt statt
versendet. Fehler werden geloggt, aber nicht weitergereicht – ein Mail-Versand-
Fehler darf eine User-Aktion nicht blockieren.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"


@dataclass
class SendResult:
    ok: bool
    dev_mode: bool = False
    message_id: Optional[str] = None
    status_code: Optional[int] = None
    error_name: Optional[str] = None
    error_message: Optional[str] = None
    raw_response: Optional[str] = None


def _parse_sender(addr: str) -> dict:
    """Brevo erwartet den Absender als {'email':…, 'name':…}. Akzeptiert die
    Konfiguration als reine Adresse ('clok@x.de') oder RFC-5322
    ('Clok <clok@x.de>')."""
    addr = addr.strip()
    if "<" in addr and ">" in addr:
        name = addr[: addr.index("<")].strip()
        email = addr[addr.index("<") + 1 : addr.index(">")].strip()
        return {"email": email, "name": name} if name else {"email": email}
    return {"email": addr}


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
            to, subject, reply_to or settings.email_reply_to or "-", text,
        )
        return SendResult(ok=True, dev_mode=True)

    payload: dict = {
        "sender": _parse_sender(settings.email_from),
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    rt = reply_to or settings.email_reply_to
    if rt:
        payload["replyTo"] = {"email": rt}

    try:
        r = httpx.post(
            BREVO_ENDPOINT,
            headers={
                "api-key": settings.brevo_api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            json=payload,
            timeout=10.0,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("Brevo-Aufruf fehlgeschlagen (Netzwerk/Timeout)")
        return SendResult(
            ok=False,
            error_name="network_error",
            error_message=str(exc),
        )

    if r.status_code >= 300:
        # Brevo liefert bei Fehlern {"code": "...", "message": "..."}.
        body_text = r.text
        try:
            body = r.json()
        except (ValueError, json.JSONDecodeError):
            body = {}
        name = body.get("code") or "unknown"
        message = body.get("message") or body_text
        log.error(
            "Brevo %d %s: %s | full body: %s | request to=%s subject=%r from=%s",
            r.status_code, name, message, body_text, to, subject, settings.email_from,
        )
        return SendResult(
            ok=False,
            status_code=r.status_code,
            error_name=name,
            error_message=message,
            raw_response=body_text,
        )

    # Success (Brevo: 201 Created)
    try:
        body = r.json()
    except (ValueError, json.JSONDecodeError):
        body = {}
    message_id = body.get("messageId")
    if isinstance(message_id, list):  # bei mehreren Empfängern eine Liste
        message_id = ",".join(str(m) for m in message_id)
    log.info("Brevo ok messageId=%s to=%s subject=%r", message_id, to, subject)
    return SendResult(
        ok=True,
        status_code=r.status_code,
        message_id=message_id,
    )
