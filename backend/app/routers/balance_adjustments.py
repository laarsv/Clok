"""Manuelle Saldo-Korrekturen pro Mitarbeiter.

Beispiele für Anwendungsfälle:
- Auszahlung von Überstunden (Buchung negativer Stunden mit Notiz
  "Auszahlung Q4 2025").
- Korrektur einer falschen Altsystem-Übernahme.
- Buchhalterische Endabrechnung beim Ausscheiden.

Nur Arbeitgeber/Admin dürfen Adjustments anlegen oder löschen;
Mitarbeiter sehen sie nur lesend (über das Drill-Down beim
Arbeitgeber bzw. später ggf. im eigenen Profil).
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.audit import log_change
from app.auth import get_current_user
from app.database import get_db
from app.models import AuditAction, BalanceAdjustment, Role, User
from app.permissions import supervises, visible_user_ids
from app.schemas import BalanceAdjustmentIn, BalanceAdjustmentOut

router = APIRouter(prefix="/api/employees", tags=["balance"])


def _check_target_read(actor: User, target_id: int, db: Session) -> User:
    if target_id not in visible_user_ids(actor, db):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    return target


def _check_target_write(actor: User, target_id: int, db: Session) -> User:
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if not (actor.role == Role.ADMIN or supervises(actor, target)):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    return target


@router.get("/{user_id}/balance-adjustments", response_model=list[BalanceAdjustmentOut])
def list_adjustments(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_target_read(actor, user_id, db)
    rows = (
        db.query(BalanceAdjustment)
        .filter(BalanceAdjustment.user_id == user_id)
        .order_by(BalanceAdjustment.effective_date.desc(), BalanceAdjustment.id.desc())
        .all()
    )
    return [BalanceAdjustmentOut.model_validate(r) for r in rows]


@router.post(
    "/{user_id}/balance-adjustments",
    response_model=BalanceAdjustmentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_adjustment(
    user_id: int,
    payload: BalanceAdjustmentIn,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_target_write(actor, user_id, db)
    adj = BalanceAdjustment(
        user_id=user_id,
        effective_date=payload.effective_date,
        hours=payload.hours,
        reason=payload.reason,
        created_by=actor.id,
    )
    db.add(adj)
    db.flush()
    log_change(
        db,
        actor_user_id=actor.id,
        action=AuditAction.CREATE,
        entity_type="balance_adjustment",
        entity_id=adj.id,
        after=adj,
    )
    db.commit()
    db.refresh(adj)
    return BalanceAdjustmentOut.model_validate(adj)


@router.delete(
    "/{user_id}/balance-adjustments/{adj_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_adjustment(
    user_id: int,
    adj_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_target_write(actor, user_id, db)
    adj = db.query(BalanceAdjustment).filter(
        BalanceAdjustment.id == adj_id,
        BalanceAdjustment.user_id == user_id,
    ).first()
    if adj is None:
        raise HTTPException(status_code=404, detail="Korrektur nicht gefunden.")
    snapshot = {c.name: getattr(adj, c.name) for c in adj.__table__.columns}
    log_change(
        db,
        actor_user_id=actor.id,
        action=AuditAction.DELETE,
        entity_type="balance_adjustment",
        entity_id=adj.id,
        before=snapshot,
    )
    db.delete(adj)
    db.commit()
