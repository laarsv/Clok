"""Audit-Log-Lese-Endpoint.

Admin sieht alles, Arbeitgeber nur Logs zu eigenen Mitarbeitern.
Mitarbeiter haben keinen Zugriff – das Audit ist Compliance-Werkzeug
für Vorgesetzte.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, Role, User
from app.permissions import require_active_user, visible_user_ids

router = APIRouter(prefix="/api/audit-log", tags=["audit"])


class AuditLogOut(BaseModel):
    id: int
    actor_user_id: Optional[int] = None
    actor_username: Optional[str] = None
    actor_full_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: int
    subject_user_id: Optional[int] = None
    before: Optional[dict] = None
    after: Optional[dict] = None
    created_at: datetime


@router.get("", response_model=list[AuditLogOut])
def list_audit(
    user_id: Optional[int] = Query(None, description="Filter: nur Einträge zu diesem MA"),
    entity_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    actor: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if actor.role == Role.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Kein Zugriff.")

    visible = visible_user_ids(actor, db)

    if user_id is not None:
        if user_id not in visible:
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
        target_subjects = {user_id}
    else:
        target_subjects = visible

    q = db.query(AuditLog).filter(
        AuditLog.subject_user_id.in_(target_subjects)
    )
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    q = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    rows = q.all()

    # Akteure auflösen für die Anzeige (kein FK-Cascade, weil ondelete=SET NULL)
    actor_ids = {r.actor_user_id for r in rows if r.actor_user_id is not None}
    actor_map: dict[int, User] = {}
    if actor_ids:
        users = db.query(User).filter(User.id.in_(actor_ids)).all()
        actor_map = {u.id: u for u in users}

    out: list[AuditLogOut] = []
    for r in rows:
        a = actor_map.get(r.actor_user_id) if r.actor_user_id else None
        out.append(AuditLogOut(
            id=r.id,
            actor_user_id=r.actor_user_id,
            actor_username=a.username if a else None,
            actor_full_name=(a.full_name if a else None),
            action=r.action.value if hasattr(r.action, "value") else str(r.action),
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            subject_user_id=r.subject_user_id,
            before=r.before,
            after=r.after,
            created_at=r.created_at,
        ))
    return out
