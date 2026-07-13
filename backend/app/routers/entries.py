"""Time-entry CRUD with ArbZG validation."""
from datetime import datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.arbzg import gross_hours, validate_entry
from app.audit import log_change
from app.closures import assert_month_editable
from app.database import get_db
from app.models import AuditAction, Project, Role, TimeEntry, User
from app.permissions import is_in_editable_window, require_active_user, supervises, visible_user_ids
from app.schemas import (
    TimeEntryCreateResponse, TimeEntryIn, TimeEntryOut, ValidationIssueOut,
)


def _owner_id_for(user: User) -> Optional[int]:
    """Besitzer-Kontext: Arbeitgeber → self, Mitarbeiter → Vorgesetzter."""
    if user.role == Role.EMPLOYER:
        return user.id
    if user.role == Role.EMPLOYEE:
        return user.supervisor_id
    return None


def _validate_project(db: Session, target: User, project_id: Optional[int]) -> None:
    """Stellt sicher, dass das gewählte Projekt dem Arbeitgeber des
    Eintrag-Eigentümers gehört. Admin darf jedes Projekt zuordnen."""
    if project_id is None:
        return
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=422, detail="Projekt nicht gefunden.")
    owner_id = _owner_id_for(target)
    if owner_id is not None and project.owner_user_id != owner_id:
        raise HTTPException(status_code=403, detail="Projekt gehört nicht zu diesem Mitarbeiter.")


def _check_entry_write(entry: TimeEntry, actor: User, db: Session) -> User:
    """Prüft, ob actor den Eintrag bearbeiten/löschen darf.
    Liefert das Target-User-Objekt (für Audit/Validation)."""
    target = db.query(User).filter(User.id == entry.user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if actor.role == Role.ADMIN or supervises(actor, target):
        return target
    if actor.id == entry.user_id:
        if is_in_editable_window(entry.start_at.date()):
            return target
        raise HTTPException(
            status_code=403,
            detail="Eintrag liegt außerhalb des Bearbeitungs-Fensters "
                   "(aktueller + letzter Monat).",
        )
    raise HTTPException(status_code=403, detail="Kein Zugriff.")

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
        project_id=entry.project_id,
        project=entry.project_ref.name if entry.project_ref else None,
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
    user_id: Optional[int] = Query(None),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    target_id = user_id if user_id is not None else user.id
    if target_id != user.id:
        if target_id not in visible_user_ids(user, db):
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
    q = db.query(TimeEntry).filter(TimeEntry.user_id == target_id)
    if from_:
        q = q.filter(TimeEntry.start_at >= from_)
    if to:
        q = q.filter(TimeEntry.start_at < to)
    return [_to_out(e) for e in q.order_by(TimeEntry.start_at.desc()).all()]


@router.get("/running", response_model=Optional[TimeEntryOut])
def running_entry(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Der aktuell laufende Eintrag des Users (end_at IS NULL) oder null."""
    e = (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == user.id, TimeEntry.end_at.is_(None))
        .order_by(TimeEntry.start_at.desc())
        .first()
    )
    return _to_out(e) if e else None


@router.post("", response_model=TimeEntryCreateResponse, status_code=status.HTTP_201_CREATED)
def create_entry(
    payload: TimeEntryIn,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    # Timer-Start (end_at leer): nur ein laufender Eintrag gleichzeitig.
    if payload.end_at is None:
        running = (
            db.query(TimeEntry)
            .filter(TimeEntry.user_id == user.id, TimeEntry.end_at.is_(None))
            .first()
        )
        if running is not None:
            raise HTTPException(status_code=409, detail="Es läuft bereits ein Timer. Bitte zuerst stoppen.")

    issues = _validate(db, user, payload)
    if any(i.severity == "error" for i in issues):
        raise HTTPException(status_code=422, detail=[i.model_dump() for i in issues])

    _validate_project(db, user, payload.project_id)
    assert_month_editable(db, user.id, payload.start_at.date(), user)
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
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    target = _check_entry_write(entry, user, db)
    # Alter UND neuer Monat müssen editierbar sein (Verschieben in gesperrten
    # Monat ebenso blockieren wie Ändern eines Eintrags im gesperrten Monat).
    assert_month_editable(db, entry.user_id, entry.start_at.date(), user)
    assert_month_editable(db, entry.user_id, payload.start_at.date(), user)

    # ArbZG gegen Daten des Eintrag-Eigentümers prüfen, nicht gegen actor.
    issues = _validate(db, target, payload, exclude_id=entry_id)
    if any(i.severity == "error" for i in issues):
        raise HTTPException(status_code=422, detail=[i.model_dump() for i in issues])

    _validate_project(db, target, payload.project_id)

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
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Eintrag nicht gefunden")
    _check_entry_write(entry, user, db)
    assert_month_editable(db, entry.user_id, entry.start_at.date(), user)
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
