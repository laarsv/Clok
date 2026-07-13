"""Monatsabschluss: Einreichen (MA) und Freigeben/Ablehnen/Wieder-öffnen (AG).

Kein Datensatz für einen Monat = offen. submitted = eingereicht (für den MA
selbst gesperrt), approved = freigegeben (für alle gesperrt). reject/reopen/
withdraw löschen den Datensatz → wieder offen.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.audit import log_change
from app.config import get_settings
from app.database import get_db
from app.models import AuditAction, MonthClosure, MonthClosureStatus, Role, User
from app.notifications.service import NotificationKind, notify
from app.permissions import require_active_user, supervises, visible_user_ids
from app.schemas import ClosureAction, MonthClosureOut

router = APIRouter(prefix="/api/closures", tags=["closures"])

_MONTH_NAMES = (
    "", "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)


def _month_label(year: int, month: int) -> str:
    return f"{_MONTH_NAMES[month]} {year}"


def _person_ctx(u: Optional[User]) -> dict:
    if u is None:
        return {"first_name": "", "full_name": ""}
    name = u.full_name or u.username
    return {"id": u.id, "first_name": name.split()[0], "full_name": name, "email": u.email}


def _link(path: str) -> str:
    return f"{get_settings().app_base_url.rstrip('/')}{path}"


def _notify_decision(
    db: Session, actor: User, target_id: int, year: int, month: int,
    headline: str, approved: bool,
) -> None:
    """Mail an den MA, wenn sein Monat entschieden wurde (freigeben/ablehnen/
    wieder öffnen). Kein Selbstversand, wenn der AG denselben Datensatz betrifft."""
    target = db.query(User).filter(User.id == target_id).first()
    if target is None or target.id == actor.id:
        return
    notify(db, kind=NotificationKind.MONTH_CLOSURE_DECIDED, recipient=target, ctx={
        "requester": _person_ctx(target),
        "approver": _person_ctx(actor),
        "month_label": _month_label(year, month),
        "decision_headline": headline,
        "approved": approved,
        "link": _link("/zeit/monat"),
    })


def _out(c: MonthClosure, user: Optional[User] = None) -> MonthClosureOut:
    return MonthClosureOut(
        user_id=c.user_id, year=c.year, month=c.month, status=c.status.value,
        submitted_at=c.submitted_at, decided_at=c.decided_at,
        full_name=(user.full_name if user else None),
        username=(user.username if user else None),
    )


def _row(db: Session, uid: int, year: int, month: int) -> Optional[MonthClosure]:
    return db.query(MonthClosure).filter(
        MonthClosure.user_id == uid,
        MonthClosure.year == year,
        MonthClosure.month == month,
    ).first()


def _is_future(year: int, month: int) -> bool:
    today = date.today()
    return (year, month) > (today.year, today.month)


def _supervise_or_403(actor: User, target_id: int, db: Session) -> None:
    if actor.role == Role.ADMIN:
        return
    target = db.query(User).filter(User.id == target_id).first()
    if target is None or not supervises(actor, target):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")


@router.get("", response_model=list[MonthClosureOut])
def list_closures(
    user_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    actor: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Status je Monat. MA sieht sich selbst; AG/Admin die betreuten MA.
    status=submitted (ohne user_id) → Team-weite offene Einreichungen (Inbox)."""
    if user_id is not None:
        if user_id != actor.id and user_id not in visible_user_ids(actor, db):
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
        target_ids = {user_id}
    else:
        target_ids = visible_user_ids(actor, db)

    q = db.query(MonthClosure).filter(MonthClosure.user_id.in_(target_ids))
    if year is not None:
        q = q.filter(MonthClosure.year == year)
    if status_filter in ("submitted", "approved"):
        q = q.filter(MonthClosure.status == MonthClosureStatus(status_filter))
    rows = q.order_by(MonthClosure.year.desc(), MonthClosure.month.desc()).all()

    users = {}
    if rows:
        ids = {r.user_id for r in rows}
        users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}
    return [_out(r, users.get(r.user_id)) for r in rows]


@router.post("/submit", response_model=MonthClosureOut)
def submit(payload: ClosureAction, actor: User = Depends(require_active_user),
           db: Session = Depends(get_db)):
    target_id = payload.user_id or actor.id
    if target_id != actor.id:
        _supervise_or_403(actor, target_id, db)
    if _is_future(payload.year, payload.month):
        raise HTTPException(status_code=422, detail="Zukünftiger Monat kann nicht eingereicht werden.")
    row = _row(db, target_id, payload.year, payload.month)
    if row and row.status == MonthClosureStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Monat ist bereits freigegeben.")
    if row is None:
        row = MonthClosure(user_id=target_id, year=payload.year, month=payload.month)
        db.add(row)
    row.status = MonthClosureStatus.SUBMITTED
    row.submitted_at = datetime.utcnow()
    row.submitted_by = actor.id
    db.flush()
    log_change(db, actor_user_id=actor.id, action=AuditAction.UPDATE,
               entity_type="month_closure", entity_id=row.id, subject_user_id=target_id)
    db.commit(); db.refresh(row)

    target = db.query(User).filter(User.id == target_id).first()
    supervisor = (
        db.query(User).filter(User.id == target.supervisor_id).first()
        if target and target.supervisor_id else None
    )
    if supervisor and supervisor.id != actor.id:
        notify(db, kind=NotificationKind.MONTH_SUBMITTED, recipient=supervisor, ctx={
            "requester": _person_ctx(target),
            "approver": _person_ctx(supervisor),
            "month_label": _month_label(payload.year, payload.month),
            "link": _link(f"/employer/employees/{target_id}"),
        })
    return _out(row)


@router.post("/approve", response_model=MonthClosureOut)
def approve(payload: ClosureAction, actor: User = Depends(require_active_user),
            db: Session = Depends(get_db)):
    if payload.user_id is None:
        raise HTTPException(status_code=422, detail="user_id erforderlich.")
    _supervise_or_403(actor, payload.user_id, db)
    if _is_future(payload.year, payload.month):
        raise HTTPException(status_code=422, detail="Zukünftiger Monat kann nicht freigegeben werden.")
    row = _row(db, payload.user_id, payload.year, payload.month)
    if row is None:
        row = MonthClosure(user_id=payload.user_id, year=payload.year, month=payload.month)
        db.add(row)
    row.status = MonthClosureStatus.APPROVED
    row.decided_at = datetime.utcnow()
    row.decided_by = actor.id
    db.flush()
    log_change(db, actor_user_id=actor.id, action=AuditAction.UPDATE,
               entity_type="month_closure", entity_id=row.id, subject_user_id=payload.user_id)
    db.commit(); db.refresh(row)
    _notify_decision(db, actor, payload.user_id, payload.year, payload.month,
                     headline="freigegeben", approved=True)
    return _out(row)


def _delete_to_open(db: Session, actor: User, target_id: int, year: int, month: int) -> bool:
    """Löscht den Abschluss-Datensatz (→ offen). Gibt True zurück, wenn etwas
    gelöscht wurde – nur dann ist eine Info-Mail an den MA sinnvoll."""
    row = _row(db, target_id, year, month)
    if row is None:
        return False
    log_change(db, actor_user_id=actor.id, action=AuditAction.DELETE,
               entity_type="month_closure", entity_id=row.id, subject_user_id=target_id)
    db.delete(row)
    db.commit()
    return True


@router.post("/reject", status_code=204)
def reject(payload: ClosureAction, actor: User = Depends(require_active_user),
           db: Session = Depends(get_db)):
    """AG lehnt eine Einreichung ab → wieder offen."""
    if payload.user_id is None:
        raise HTTPException(status_code=422, detail="user_id erforderlich.")
    _supervise_or_403(actor, payload.user_id, db)
    if _delete_to_open(db, actor, payload.user_id, payload.year, payload.month):
        _notify_decision(db, actor, payload.user_id, payload.year, payload.month,
                         headline="zur Korrektur zurückgegeben", approved=False)


@router.post("/reopen", status_code=204)
def reopen(payload: ClosureAction, actor: User = Depends(require_active_user),
           db: Session = Depends(get_db)):
    """AG/Admin öffnet einen freigegebenen Monat wieder → editierbar."""
    if payload.user_id is None:
        raise HTTPException(status_code=422, detail="user_id erforderlich.")
    _supervise_or_403(actor, payload.user_id, db)
    if _delete_to_open(db, actor, payload.user_id, payload.year, payload.month):
        _notify_decision(db, actor, payload.user_id, payload.year, payload.month,
                         headline="wieder geöffnet", approved=False)


@router.post("/withdraw", status_code=204)
def withdraw(payload: ClosureAction, actor: User = Depends(require_active_user),
             db: Session = Depends(get_db)):
    """MA zieht die eigene Einreichung zurück (nur solange nicht freigegeben)."""
    target_id = payload.user_id or actor.id
    if target_id != actor.id:
        _supervise_or_403(actor, target_id, db)
    row = _row(db, target_id, payload.year, payload.month)
    if row is None:
        return
    if row.status != MonthClosureStatus.SUBMITTED:
        raise HTTPException(status_code=409, detail="Nur eingereichte Monate können zurückgezogen werden.")
    _delete_to_open(db, actor, target_id, payload.year, payload.month)
