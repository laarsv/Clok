"""Abwesenheiten: Urlaubsanträge, Krankmeldungen, unbezahlt."""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.audit import log_change
from app.balance import hours_for_absence
from app.closures import assert_month_editable
from app.config import get_settings
from app.database import get_db
from app.models import Absence, AbsenceStatus, AbsenceType, AuditAction, Role, User
from app.notifications.service import NotificationKind, notify
from app.permissions import is_in_editable_window, require_active_user, supervises, visible_user_ids
from app.schemas import (
    AbsenceDecision, AbsenceIn, AbsenceOut, AbsenceUpdate,
    TeamAbsenceRow, TeamAbsencesOut,
)

router = APIRouter(prefix="/api/absences", tags=["absences"])


def _to_out(
    db: Session, a: Absence,
    clip_start: Optional[date] = None, clip_end: Optional[date] = None,
) -> AbsenceOut:
    out = AbsenceOut.model_validate(a)
    user = db.query(User).filter(User.id == a.user_id).first()
    if user is not None:
        out.paid_hours = hours_for_absence(db, user, a, clip_start, clip_end)
    return out


def _absence_link(absence_id: int) -> str:
    base = get_settings().app_base_url.rstrip("/")
    return f"{base}/employer/absences#{absence_id}"


def _format_de(d) -> str:
    return d.strftime("%d.%m.%Y")


def _build_ctx(absence: Absence, requester: User, approver: User | None) -> dict:
    from app.absences import working_days_in_range  # local import vermeidet circular
    from app.database import SessionLocal
    # workdays nur für die Subject-/Body-Templates
    db_local = SessionLocal()
    try:
        workdays = working_days_in_range(
            db_local, requester, absence.start_date, absence.end_date,
            include_absences=False,
        )
    finally:
        db_local.close()
    return {
        "requester": {
            "id": requester.id,
            "first_name": (requester.full_name or requester.username).split()[0],
            "full_name": requester.full_name or requester.username,
            "email": requester.email,
        },
        "approver": (
            {
                "id": approver.id,
                "first_name": (approver.full_name or approver.username).split()[0],
                "full_name": approver.full_name or approver.username,
                "email": approver.email,
            } if approver else {"first_name": "", "full_name": ""}
        ),
        "start": _format_de(absence.start_date),
        "end": _format_de(absence.end_date),
        "workdays": workdays,
        "link": _absence_link(absence.id),
        "note": absence.note,
    }


@router.get("", response_model=list[AbsenceOut])
def list_absences(
    user_id: Optional[int] = Query(None),
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if user_id is None:
        target_ids = {user.id}
    else:
        allowed = visible_user_ids(user, db)
        if user_id not in allowed:
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
        target_ids = {user_id}

    q = db.query(Absence).filter(Absence.user_id.in_(target_ids))
    if from_ and to:
        # Nur im Fenster überlappende Abwesenheiten; paid_hours wird auf das
        # Fenster beschnitten (Monats-Anteil bei monatsübergreifendem Urlaub).
        q = q.filter(Absence.start_date <= to, Absence.end_date >= from_)
    rows = q.order_by(Absence.start_date.desc()).all()
    return [_to_out(db, a, from_, to) for a in rows]


@router.get("/team", response_model=TeamAbsencesOut)
def team_absences(
    from_: date = Query(..., alias="from"),
    to: date = Query(...),
    actor: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Alle sichtbaren aktiven Mitarbeiter + ihre Abwesenheiten (approved+pending)
    im Zeitraum – für den Team-Abwesenheitskalender. Nur AG/Admin."""
    if actor.role == Role.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    ids = visible_user_ids(actor, db)
    emps = (
        db.query(User)
        .filter(User.id.in_(ids), User.role == Role.EMPLOYEE, User.offboarded_at.is_(None))
        .order_by(User.full_name, User.username)
        .all()
    )
    emp_ids = [e.id for e in emps]
    abs_rows = []
    if emp_ids:
        abs_rows = (
            db.query(Absence)
            .filter(
                Absence.user_id.in_(emp_ids),
                Absence.status.in_((AbsenceStatus.PENDING, AbsenceStatus.APPROVED)),
                Absence.start_date <= to,
                Absence.end_date >= from_,
            )
            .all()
        )
    return TeamAbsencesOut(
        employees=[TeamAbsenceRow(user_id=e.id, name=(e.full_name or e.username)) for e in emps],
        absences=[AbsenceOut.model_validate(a) for a in abs_rows],
    )


@router.post("", response_model=AbsenceOut, status_code=status.HTTP_201_CREATED)
def create_absence(
    payload: AbsenceIn,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="Ende vor Start.")

    target_user_id = payload.user_id or user.id
    created_for_other = target_user_id != user.id
    if created_for_other:
        # Arbeitgeber/Admin dürfen für die von ihnen betreuten Mitarbeiter
        # JEDE Abwesenheitsart eintragen – auch rückwirkend (Urlaub,
        # Krankheit, Sonderurlaub …). Sie sind die genehmigende Instanz,
        # deshalb gilt ein solcher Eintrag sofort als genehmigt.
        target = db.query(User).filter(User.id == target_user_id).first()
        if target is None:
            raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
        if not supervises(user, target):
            raise HTTPException(status_code=403, detail="Kein Zugriff.")

    assert_month_editable(db, target_user_id, payload.start_date, user)
    auto_approve = payload.type == AbsenceType.SICK or created_for_other
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
    db.flush()
    log_change(
        db,
        actor_user_id=user.id,
        action=AuditAction.CREATE,
        entity_type="absence",
        entity_id=absence.id,
        after=absence,
    )
    db.commit()
    db.refresh(absence)

    # ---- Mail-Trigger ----
    requester = db.query(User).filter(User.id == absence.user_id).first()
    supervisor = (
        db.query(User).filter(User.id == requester.supervisor_id).first()
        if requester and requester.supervisor_id else None
    )
    # „Eingang"-Mails an den Vorgesetzten nur, wenn er den Eintrag nicht
    # selbst angelegt hat – sonst würde er sich selbst benachrichtigen.
    notify_supervisor = supervisor is not None and supervisor.id != user.id
    if absence.type == AbsenceType.SICK:
        if notify_supervisor:
            notify(db, kind=NotificationKind.INCOMING_SICK_NOTE,
                   recipient=supervisor, ctx=_build_ctx(absence, requester, supervisor))
        if user.id != requester.id:
            # Krankmeldung durch Dritte → Info-Mail an MA
            notify(db, kind=NotificationKind.SICK_NOTE_FOR_YOU,
                   recipient=requester, ctx=_build_ctx(absence, requester, user))
    elif absence.type == AbsenceType.VACATION:
        # Nur echte, offene Anträge gehen als „Eingang" an den Vorgesetzten.
        # Trägt der Arbeitgeber Urlaub selbst ein, ist er bereits genehmigt.
        if notify_supervisor and absence.status == AbsenceStatus.PENDING:
            notify(db, kind=NotificationKind.INCOMING_VACATION_REQUEST,
                   recipient=supervisor, ctx=_build_ctx(absence, requester, supervisor))

    return _to_out(db, absence)


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
    assert_month_editable(db, absence.user_id, absence.start_date, user)
    before_snapshot = {c.name: getattr(absence, c.name) for c in absence.__table__.columns}
    absence.status = new_status
    absence.decided_at = datetime.utcnow()
    absence.decided_by = user.id
    if payload.note:
        absence.note = (absence.note or "") + ("\n" if absence.note else "") + payload.note
    db.flush()
    log_change(
        db,
        actor_user_id=user.id,
        action=AuditAction.UPDATE,
        entity_type="absence",
        entity_id=absence.id,
        before=before_snapshot,
        after=absence,
    )
    db.commit()
    db.refresh(absence)
    return absence


def _notify_decision(db: Session, absence: Absence, decided_by: User) -> None:
    requester = db.query(User).filter(User.id == absence.user_id).first()
    if requester is None:
        return
    ctx = _build_ctx(absence, requester, decided_by)
    ctx["approved"] = absence.status == AbsenceStatus.APPROVED
    notify(db, kind=NotificationKind.VACATION_DECIDED, recipient=requester, ctx=ctx)


def _check_absence_write(absence: Absence, actor: User, db: Session) -> User:
    target = db.query(User).filter(User.id == absence.user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if actor.role == Role.ADMIN or supervises(actor, target):
        return target
    if actor.id == absence.user_id:
        if is_in_editable_window(absence.start_date):
            return target
        raise HTTPException(
            status_code=403,
            detail="Eintrag liegt außerhalb des Bearbeitungs-Fensters "
                   "(aktueller + letzter Monat).",
        )
    raise HTTPException(status_code=403, detail="Kein Zugriff.")


@router.patch("/{absence_id}", response_model=AbsenceOut)
def update_absence(
    absence_id: int,
    payload: AbsenceUpdate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    absence = db.query(Absence).filter(Absence.id == absence_id).first()
    if absence is None:
        raise HTTPException(status_code=404, detail="Antrag nicht gefunden.")
    _check_absence_write(absence, user, db)
    assert_month_editable(db, absence.user_id, absence.start_date, user)

    updates = payload.model_dump(exclude_unset=True)
    if "start_date" in updates and "end_date" in updates:
        if updates["end_date"] < updates["start_date"]:
            raise HTTPException(status_code=422, detail="Ende vor Start.")
    elif "start_date" in updates:
        if absence.end_date < updates["start_date"]:
            raise HTTPException(status_code=422, detail="Ende vor Start.")
    elif "end_date" in updates:
        if updates["end_date"] < absence.start_date:
            raise HTTPException(status_code=422, detail="Ende vor Start.")

    before_snapshot = {c.name: getattr(absence, c.name) for c in absence.__table__.columns}
    for field, value in updates.items():
        setattr(absence, field, value)
    db.flush()
    log_change(
        db,
        actor_user_id=user.id,
        action=AuditAction.UPDATE,
        entity_type="absence",
        entity_id=absence.id,
        before=before_snapshot,
        after=absence,
    )
    db.commit()
    db.refresh(absence)
    return _to_out(db, absence)


@router.patch("/{absence_id}/approve", response_model=AbsenceOut)
def approve_absence(
    absence_id: int,
    payload: AbsenceDecision,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    absence = _decide(absence_id, AbsenceStatus.APPROVED, payload, user, db)
    _notify_decision(db, absence, user)
    return _to_out(db, absence)


@router.patch("/{absence_id}/reject", response_model=AbsenceOut)
def reject_absence(
    absence_id: int,
    payload: AbsenceDecision,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    absence = _decide(absence_id, AbsenceStatus.REJECTED, payload, user, db)
    _notify_decision(db, absence, user)
    return _to_out(db, absence)


@router.delete("/{absence_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_absence(
    absence_id: int,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    absence = db.query(Absence).filter(Absence.id == absence_id).first()
    if absence is None:
        raise HTTPException(status_code=404, detail="Antrag nicht gefunden.")
    _check_absence_write(absence, user, db)
    assert_month_editable(db, absence.user_id, absence.start_date, user)
    before_snapshot = {c.name: getattr(absence, c.name) for c in absence.__table__.columns}
    log_change(
        db,
        actor_user_id=user.id,
        action=AuditAction.DELETE,
        entity_type="absence",
        entity_id=absence.id,
        before=before_snapshot,
    )
    db.delete(absence)
    db.commit()
