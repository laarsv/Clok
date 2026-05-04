"""Audit-Log-Helpers.

Geschrieben aus den Service-Routen, weil dort der Akteur (current_user)
und der Vorher/Nachher-Zustand zur Hand sind. Bewusst kein
SQLAlchemy-Event-Listener: dort hätten wir den Akteur nicht.

Werte werden als Python-Dicts (JSON-kompatibel) übergeben; SQLAlchemy
serialisiert in die JSON-Spalte. So kommen sie beim Lesen wieder als
Dict zurück – konsistent zwischen Postgres und SQLite (Tests).
"""
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AuditAction, AuditLog


def _serialize(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return float(value)
    return value


def _to_dict(obj: Any) -> Optional[dict]:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    # SQLAlchemy-Modell
    return {
        c.name: _serialize(getattr(obj, c.name))
        for c in obj.__table__.columns
    }


def log_change(
    db: Session,
    *,
    actor_user_id: Optional[int],
    action: AuditAction,
    entity_type: str,
    entity_id: int,
    subject_user_id: Optional[int] = None,
    before: Any = None,
    after: Any = None,
) -> None:
    """Schreibt einen Audit-Eintrag. Caller muss db.commit() selbst auslösen.

    `subject_user_id` ist der betroffene Mitarbeiter – wird vom
    Audit-Viewer für den Filter "alle Änderungen an User X" genutzt.
    Wenn nicht übergeben, wird er aus before/after abgeleitet (für
    Entitäten mit user_id-Feld).
    """
    if subject_user_id is None:
        for src in (after, before):
            if isinstance(src, dict) and "user_id" in src and src["user_id"]:
                subject_user_id = int(src["user_id"])
                break
            if src is not None and hasattr(src, "user_id") and getattr(src, "user_id"):
                subject_user_id = int(getattr(src, "user_id"))
                break
        if subject_user_id is None and entity_type == "user":
            subject_user_id = entity_id

    db.add(AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        subject_user_id=subject_user_id,
        before=_to_dict(before),
        after=_to_dict(after),
    ))
