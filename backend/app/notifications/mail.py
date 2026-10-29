"""Mailversand über SMTP (nur Standardbibliothek, kein zusätzliches Paket).

send() liefert ein SendResult mit allen Diagnose-Infos (message_id, SMTP-Code,
Fehlerart). So kann der Test-Endpoint die Antwort direkt durchreichen, und
der normale Fire-and-forget-Pfad nutzt einfach `result.ok`.

Im Dev-Modus (SMTP nicht konfiguriert) wird die Mail strukturiert geloggt statt
versendet. Fehler werden geloggt, aber nicht weitergereicht – ein Mail-Versand-
Fehler darf eine User-Aktion nicht blockieren. Im Fehlerfall stehen im Log nie
Passwort, Empfänger, Betreff oder Text, nur Fehlerart und SMTP-Code.

Alle Aufrufer sind synchron (FastAPI-Threadpool, Scheduler-Thread), deshalb
blockiert send() einfach.
"""
from __future__ import annotations

import logging
import re
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.policy import SMTP as SMTP_POLICY
from email.utils import formataddr, formatdate, make_msgid, parseaddr
from typing import Optional

from app.config import get_settings

log = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 10.0
SMTP_IMPLICIT_TLS_PORT = 465
# Eine einzelne Adresse ohne Leerraum, Komma, Semikolon, Klammern oder
# Anführungszeichen (kein Einschleusen weiterer Empfänger oder Kopfzeilen).
_ADDRESS = re.compile(r'[^\s<>,;"()]+@[^\s<>,;"()@]+')


@dataclass
class SendResult:
    ok: bool
    dev_mode: bool = False
    message_id: Optional[str] = None
    status_code: Optional[int] = None
    error_name: Optional[str] = None
    error_message: Optional[str] = None


def _parse_sender(addr: str) -> tuple[str, str]:
    """Liefert (Anzeigename, Adresse). Akzeptiert die Konfiguration als reine
    Adresse ('clok@x.de') oder RFC-5322 ('Clok <clok@x.de>')."""
    return parseaddr(addr)


def _security(settings) -> str:
    if settings.smtp_security == "auto":
        return "ssl" if settings.smtp_port == SMTP_IMPLICIT_TLS_PORT else "starttls"
    return settings.smtp_security


def _describe(exc: Exception) -> tuple[Optional[int], str]:
    """(SMTP-Code, Kurztext) für die Diagnose-Antwort. Der Serverkurztext ist
    nur für den Aufrufer des Test-Endpoints gedacht und wird nie geloggt."""
    if isinstance(exc, smtplib.SMTPRecipientsRefused) and exc.recipients:
        code, reply = next(iter(exc.recipients.values()))
    else:
        code = getattr(exc, "smtp_code", None)
        reply = getattr(exc, "smtp_error", None)
    if isinstance(reply, bytes):
        reply = reply.decode("utf-8", "replace")
    if reply:
        return code, str(reply)[:200]
    return code, "Verbindung zum Mailserver fehlgeschlagen oder abgebrochen"


def _build_message(
    sender: tuple[str, str],
    to: str,
    subject: str,
    html: str,
    text: str,
    reply_to: str,
) -> EmailMessage:
    """Mehrteilige Mail (Text und HTML, UTF-8). Wirft ValueError bei
    Zeilenumbrüchen in Kopfzeilen."""
    name, address = sender
    msg = EmailMessage(policy=SMTP_POLICY)
    msg["From"] = formataddr((name, address))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = formatdate(localtime=False)
    msg["Message-ID"] = make_msgid(domain=address.rpartition("@")[2] or None)
    msg["Auto-Submitted"] = "auto-generated"
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(text, charset="utf-8")
    msg.add_alternative(html, subtype="html", charset="utf-8")
    return msg


def _smtp_send(settings, msg: EmailMessage, from_addr: str, to: str) -> None:
    security = _security(settings)
    context = ssl.create_default_context()  # prüft Zertifikat und Hostname
    if security == "ssl":
        connection = smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=SMTP_TIMEOUT_SECONDS,
            context=context,
        )
    else:
        connection = smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
        )
    with connection as server:
        server.ehlo()
        if security == "starttls":
            server.starttls(context=context)
            server.ehlo()
        server.login(settings.smtp_user, settings.smtp_password.get_secret_value())
        server.send_message(msg, from_addr=from_addr, to_addrs=[to])


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
            "[email-dev-mode] to=%r subject=%r reply_to=%s\n--- text ---\n%s",
            to, subject, reply_to or settings.email_reply_to or "-", text,
        )
        return SendResult(ok=True, dev_mode=True)

    sender = _parse_sender(settings.mail_from)
    reply = (reply_to or settings.email_reply_to).strip()
    if not _ADDRESS.fullmatch(to) or not _ADDRESS.fullmatch(sender[1]) or (
        reply and not _ADDRESS.fullmatch(reply)
    ):
        log.warning("Mail übersprungen: ungültige Absender-, Empfänger- oder Reply-To-Adresse")
        return SendResult(
            ok=False,
            error_name="invalid_address",
            error_message="Ungültige Absender-, Empfänger- oder Reply-To-Adresse",
        )

    try:
        msg = _build_message(sender, to, subject, html, text, reply)
    except ValueError as exc:
        log.warning("Mail übersprungen: ungültige Kopfzeile (%s)", type(exc).__name__)
        return SendResult(
            ok=False,
            error_name="invalid_header",
            error_message="Ungültige Kopfzeile (Zeilenumbruch in Name oder Betreff)",
        )

    try:
        _smtp_send(settings, msg, sender[1], to)
    except (smtplib.SMTPException, OSError, ValueError) as exc:
        # ValueError: z. B. Nicht-ASCII-Zeichen im SMTP-Kommando. Ausnahmetexte können
        # Adressen oder Serverantworten enthalten: im Log nur Art und Code.
        code, message = _describe(exc)
        log.warning("SMTP-Versand fehlgeschlagen: %s (Code %s)", type(exc).__name__, code)
        return SendResult(
            ok=False,
            status_code=code,
            error_name=type(exc).__name__,
            error_message=message,
        )

    message_id = str(msg["Message-ID"])
    log.info("Mail versendet (message_id=%s)", message_id)
    return SendResult(ok=True, message_id=message_id)
