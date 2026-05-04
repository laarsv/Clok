"""Service-Layer für Mailversand: lädt Templates, prüft User-Settings,
schreibt Dedup-Log und ruft den Resend-Wrapper.

Eine Funktion: notify(kind, recipient, ctx, period_key=None).

period_key wird nur für die zeitbasierten Reminders gesetzt; bei
ereignisgesteuerten Mails (Urlaubsantrag entschieden, Krankmeldung
eingetragen) ist Dedup nicht sinnvoll – jede Aktion soll eigene Mail.
"""
from __future__ import annotations

import logging
from enum import Enum
from pathlib import Path
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.models import NotificationLog, NotificationSettings, User
from app.notifications import resend

log = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "emails"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


class NotificationKind(str, Enum):
    INCOMING_VACATION_REQUEST = "incoming_vacation_request"
    VACATION_DECIDED = "vacation_decided"
    INCOMING_SICK_NOTE = "incoming_sick_note"
    SICK_NOTE_FOR_YOU = "sick_note_for_you"
    MONTH_COMPLETE = "month_complete"
    REMINDER_NO_ENTRY = "reminder_no_entry"
    REMINDER_REMAINING_VACATION = "reminder_remaining_vacation"
    INVITE_EMPLOYEE = "invite_employee"
    PASSWORD_RESET = "password_reset"


# kind → (settings-Feld am Empfänger, template-Basename, Subject-Template)
_TEMPLATES: dict[NotificationKind, tuple[str, str, str]] = {
    NotificationKind.INCOMING_VACATION_REQUEST: (
        "incoming_vacation_request", "vacation_request",
        "Urlaubsantrag von {requester_full_name}",
    ),
    NotificationKind.VACATION_DECIDED: (
        "vacation_decided", "vacation_decided",
        "Dein Urlaubsantrag wurde {decision}",
    ),
    NotificationKind.INCOMING_SICK_NOTE: (
        "incoming_sick_note", "sick_note_to_employer",
        "{requester_full_name} ist krank",
    ),
    NotificationKind.SICK_NOTE_FOR_YOU: (
        "incoming_sick_note", "sick_note_for_you",
        "Krankmeldung für dich",
    ),
    NotificationKind.MONTH_COMPLETE: (
        "month_complete", "month_complete",
        "{requester_full_name}: Monat {month} ist komplett",
    ),
    NotificationKind.REMINDER_NO_ENTRY: (
        "reminder_no_entry", "reminder_no_entry",
        "Zwei Tage ohne Eintrag – alles okay?",
    ),
    NotificationKind.REMINDER_REMAINING_VACATION: (
        "reminder_remaining_vacation", "reminder_remaining_vacation",
        "Du hast noch {remaining} Urlaubstage",
    ),
    NotificationKind.INVITE_EMPLOYEE: (
        # Settings-Feld existiert nicht; Invite-Mails sind nicht abschaltbar.
        "_invite_always_on", "invite_employee",
        "Willkommen bei Clok – richte dein Konto ein",
    ),
    NotificationKind.PASSWORD_RESET: (
        # Sicherheitsrelevant: nicht abschaltbar.
        "_security_always_on", "password_reset",
        "Neues Passwort für Clok",
    ),
}


def _first_name(u: User) -> str:
    if u.full_name:
        return u.full_name.split()[0]
    return u.username


def _build_user_ctx(u: User) -> dict:
    return {
        "id": u.id,
        "first_name": _first_name(u),
        "full_name": u.full_name or u.username,
        "email": u.email,
    }


def _setting_enabled(db: Session, user: User, field: str) -> bool:
    if field.startswith("_"):
        # Sentinel: Invite/Bootstrap-Mails sind immer an, kein User-Toggle.
        return True
    s = db.query(NotificationSettings).filter(NotificationSettings.user_id == user.id).first()
    if s is None:
        return True
    return bool(getattr(s, field, True))


def _already_sent(db: Session, user_id: int, kind: NotificationKind, period_key: str) -> bool:
    q = db.query(NotificationLog).filter(
        NotificationLog.user_id == user_id,
        NotificationLog.kind == kind.value,
        NotificationLog.period_key == period_key,
    )
    return db.query(q.exists()).scalar()


def notify(
    db: Session,
    *,
    kind: NotificationKind,
    recipient: User,
    ctx: dict,
    period_key: Optional[str] = None,
) -> bool:
    setting_field, template_base, subject_tpl = _TEMPLATES[kind]
    if not _setting_enabled(db, recipient, setting_field):
        log.info("Mail %s an user_id=%s übersprungen (deaktiviert)", kind.value, recipient.id)
        return False

    if period_key and _already_sent(db, recipient.id, kind, period_key):
        log.info("Mail %s an user_id=%s skipped (already sent for %s)",
                 kind.value, recipient.id, period_key)
        return False

    full_ctx = {
        "subject": subject_tpl,
        "requester_full_name": ctx.get("requester", {}).get("full_name", ""),
        "remaining": ctx.get("remaining"),
        "month": ctx.get("month"),
        "decision": "genehmigt" if ctx.get("approved") else "abgelehnt",
        **ctx,
    }
    try:
        subject = subject_tpl.format(**full_ctx)
    except Exception:  # noqa: BLE001
        subject = subject_tpl

    text = _env.get_template(f"{template_base}.txt.j2").render(**full_ctx)
    html = _env.get_template(f"{template_base}.html.j2").render(subject=subject, **full_ctx)

    ok = resend.send(to=recipient.email, subject=subject, html=html, text=text)

    if ok and period_key:
        db.add(NotificationLog(user_id=recipient.id, kind=kind.value, period_key=period_key))
        db.commit()

    return ok
