"""Time-entry CRUD with ArbZG validation."""
from datetime import datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.arbzg import gross_hours, validate_entry
from app.audit import log_change
from app.auth import get_current_user
from app.database import get_db
from app.models import AuditAction, TimeEntry, User
from app.schemas import (
    TimeEntryCreateResponse, TimeEntryIn, TimeEntryOut, ValidationIssueOut,
)

router = APIRouter(prefix="/api/entries", tags=["entries"])


def _to_out(entry: TimeEntry) -> TimeEntryOut:
    if entry.end_at:
        gross = gross_hours(entry.start_at, entry.end_at)
        net = gross - entry.break_minutes / 60.0
    else:
        gross = 0.0
        net = 0.0
    return TimeEntryOut(
        id=entry.id,
        user_id=entry.user_id,
        start_at=entry.start_at,
        end_at=entry.end_at,
        break_minutes=entry.break_minutes,
        project=entry.project,
        note=entry.note,
        net_hours=round(net, 2),
        gross_hours=round(gross, 2),
    )


def _validate(db: Session, user: User, payload: TimeEntryIn,
              exclude_id: Optional[int] = None) -> list[ValidationIssueOut]:
    if payload.end_at is None:
        return []  # laufender Eintrag, Validierung beim Stoppen

    day_start = datetime.combine(payload.start_at.date(), time.min)
    day_end = day_start + timedelta(days=1)

    other_q = db.query(TimeEntry).filter(
        TimeEntry.user_id == user.id,
        TimeEntry.start_at >= day_start,
        TimeEntry.start_at < day_end,
        TimeEntry.end_at.isnot(None),
    )
    if exclude_id is not None:
        other_q = other_q.filter(TimeEntry.id != exclude_id)
    others = [(e.start_at, e.end_at, e.break_minutes) for e in other_q.all()]

    prev_q = db.query(TimeEntry).filter(
        TimeEntry.user_id == user.id,
        TimeEntry.end_at.isnot(None),
        TimeEntry.end_at < day_start,
    ).order_by(TimeEntry.end_at.desc()).first()
    prev_end = prev_q.end_at if prev_q else None

    week_start = day_start - timedelta(days=day_start.weekday())
    week_q = db.query(TimeEntry).filter(
        TimeEntry.user_id == user.id,
        TimeEntry.start_at >= week_start,
        TimeEntry.start_at < day_start,
        TimeEntry.end_at.isnot(None),
    )
    if exclude_id is not None:
        week_q = week_q.filter(TimeEntry.id != exclude_id)
    weekly_already = sum(
        max(0.0, (e.end_at - e.start_at).total_seconds() / 3600 - e.break_minutes / 60)
        for e in week_q.all()
    )

    issues = validate_entry(
        start=payload.start_at,
        end=payload.end_at,
        break_minutes=payload.break_minutes,
        same_day_other_entries=others,
        previous_day_last_end=prev_end,
        weekly_hours_already=weekly_already,
    )
    return [ValidationIssueOut(severity=i.severity, code=i.code, message=i.message)
            for i in issues]


@router.get("", response_model=list[TimeEntryOut])
def list_entries(
    from_: Optional[datetime] = Query(None, alias="from"),
    to: Optional[datetime] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TimeEntry).filter(TimeEntry.user_id == user.id)
    if from_:
        q = q.filter(TimeEntry.start_at >= from_)
    if to:
        q = q.filter(TimeEntry.start_at < to)
    return [_to_out(e) for e in q.order_by(TimeEntry.start_at.desc()).all()]


@router.post("", response_model=TimeEntryCreateResponse, status_code=status.HTTP_201_CREATED)
def create_entry(
    payload: TimeEntryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    issues = _validate(db, user, payload)
    if any(i.severity == "error" for i in issues):
        raise HTTPException(status_code=422, detail=[i.model_dump() for i in issues])

    entry = TimeEntry(user_id=user.id, **payload.model_dump())
    db.add(entry)
    db.flush()
    log_change(
        db,
        actor_user_id=user.id,
        action=AuditAction.CREATE,
        entity_type="time_entry",
        entity_id=entry.id,
        after=entry,
    )
    db.commit()
    db.refresh(entry)
    return TimeEntryCreateResponse(entry=_to_out(entry), issues=issues)


@router.patch("/{entry_id}", response_model=TimeEntryCreateResponse)
def update_entry(
    entry_id: int,
    payload: TimeEntryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.query(TimeEntry).filter(
        TimeEntry.id == entry_id, TimeEntry.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")

    issues = _validate(db, user, payload, exclude_id=entry_id)
    if any(i.severity == "error" for i in issues):
        raise HTTPException(status_code=422, detail=[i.model_dump() for i in issues])

    before_snapshot = {c.name: getattr(entry, c.name) for c in entry.__table__.columns}
    for field, value in payload.model_dump().items():
        setattr(entry, field, value)
    db.flush()
    log_change(
        db,
        actor_user_id=user.id,
        action=AuditAction.UPDATE,
        entity_type="time_entry",
        entity_id=entry.id,
        before=before_snapshot,
        after=entry,
    )
    db.commit()
    db.refresh(entry)
    return TimeEntryCreateResponse(entry=_to_out(entry), issues=issues)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.query(TimeEntry).filter(
        TimeEntry.id == entry_id, TimeEntry.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    before_snapshot = {c.name: getattr(entry, c.name) for c in entry.__table__.columns}
    log_change(
        db,
        actor_user_id=user.id,
        action=AuditAction.DELETE,
        entity_type="time_entry",
        entity_id=entry.id,
        before=before_snapshot,
    )
    db.delete(entry)
    db.commit()
