"""Audit-Log-Helpers.

Geschrieben aus den Service-Routen, weil dort der Akteur (current_user)
und der Vorher/Nachher-Zustand zur Hand sind. Bewusst kein
SQLAlchemy-Event-Listener: dort hätten wir den Akteur nicht.
"""
import json
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AuditAction, AuditLog


def _serialize(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
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
    before: Any = None,
    after: Any = None,
) -> None:
    """Schreibt einen Audit-Eintrag. Caller muss db.commit() selbst auslösen."""
    before_dict = _to_dict(before)
    after_dict = _to_dict(after)
    db.add(AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=json.dumps(before_dict, ensure_ascii=False) if before_dict is not None else None,
        after=json.dumps(after_dict, ensure_ascii=False) if after_dict is not None else None,
    ))
