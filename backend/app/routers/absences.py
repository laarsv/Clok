"""Abwesenheiten: Urlaubsanträge, Krankmeldungen, unbezahlt."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Absence, AbsenceStatus, AbsenceType, Role, User
from app.permissions import supervises, visible_user_ids
from app.schemas import AbsenceDecision, AbsenceIn, AbsenceOut

router = APIRouter(prefix="/api/absences", tags=["absences"])


def _to_out(a: Absence) -> AbsenceOut:
    return AbsenceOut.model_validate(a)


@router.get("", response_model=list[AbsenceOut])
def list_absences(
    user_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_id is None:
        target_ids = {user.id}
    else:
        allowed = visible_user_ids(user, db)
        if user_id not in allowed:
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
        target_ids = {user_id}

    rows = (
        db.query(Absence)
        .filter(Absence.user_id.in_(target_ids))
        .order_by(Absence.start_date.desc())
        .all()
    )
    return [_to_out(a) for a in rows]


@router.post("", response_model=AbsenceOut, status_code=status.HTTP_201_CREATED)
def create_absence(
    payload: AbsenceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="Ende vor Start.")

    target_user_id = payload.user_id or user.id
    if target_user_id != user.id:
        # Nur Arbeitgeber/Admin dürfen für andere – und nur Krankheit.
        target = db.query(User).filter(User.id == target_user_id).first()
        if target is None:
            raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
        if not supervises(user, target):
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
        if payload.type != AbsenceType.SICK:
            raise HTTPException(
                status_code=403,
                detail="Für andere darf nur Krankheit eingetragen werden.",
            )

    auto_approve = payload.type == AbsenceType.SICK
    absence = Absence(
        user_id=target_user_id,
        type=payload.type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        note=payload.note,
        status=AbsenceStatus.APPROVED if auto_approve else AbsenceStatus.PENDING,
        decided_at=datetime.utcnow() if auto_approve else None,
        decided_by=user.id if auto_approve else None,
    )
    db.add(absence)
    db.commit()
    db.refresh(absence)
    return _to_out(absence)


def _decide(
    absence_id: int,
    new_status: AbsenceStatus,
    payload: AbsenceDecision,
    user: User,
    db: Session,
) -> Absence:
    absence = db.query(Absence).filter(Absence.id == absence_id).first()
    if absence is None:
        raise HTTPException(status_code=404, detail="Antrag nicht gefunden.")
    target = db.query(User).filter(User.id == absence.user_id).first()
    if target is None or not supervises(user, target):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    if absence.status != AbsenceStatus.PENDING:
        raise HTTPException(status_code=409, detail="Antrag ist nicht mehr offen.")
    absence.status = new_status
    absence.decided_at = datetime.utcnow()
    absence.decided_by = user.id
    if payload.note:
        absence.note = (absence.note or "") + ("\n" if absence.note else "") + payload.note
    db.commit()
    db.refresh(absence)
    return absence


@router.patch("/{absence_id}/approve", response_model=AbsenceOut)
def approve_absence(
    absence_id: int,
    payload: AbsenceDecision,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_out(_decide(absence_id, AbsenceStatus.APPROVED, payload, user, db))


@router.patch("/{absence_id}/reject", response_model=AbsenceOut)
def reject_absence(
    absence_id: int,
    payload: AbsenceDecision,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_out(_decide(absence_id, AbsenceStatus.REJECTED, payload, user, db))


@router.delete("/{absence_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_absence(
    absence_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    absence = db.query(Absence).filter(Absence.id == absence_id).first()
    if absence is None:
        raise HTTPException(status_code=404, detail="Antrag nicht gefunden.")
    is_admin = user.role == Role.ADMIN
    is_own_pending = absence.user_id == user.id and absence.status == AbsenceStatus.PENDING
    if not (is_admin or is_own_pending):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    db.delete(absence)
    db.commit()
