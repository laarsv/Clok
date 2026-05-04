"""Mitarbeiter-Verwaltung: Anlegen, Auflisten, Stammdaten ändern, CSV-Import,
Offboarding/Reactivate und Hard-Delete (Admin)."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password
from app.config import get_settings
from app.database import get_db
from app.importers.absences_csv import import_absences
from app.importers.time_entries_csv import import_time_entries
from app.models import Role, User
from app.notifications.service import NotificationKind, notify
from app.permissions import require_role, supervises, visible_user_ids
from app.schemas import EmployeeCreate, UserOut, UserUpdate
from app.terms import create_initial_terms
from app.work_days import legal_min_vacation_days, normalize as normalize_work_days


ONBOARDING_TOKEN_VALID_DAYS = 7


HARD_DELETE_RETENTION_DAYS = 365 * 10  # 10 Jahre Aufbewahrung

router = APIRouter(prefix="/api/employees", tags=["employees"])


_IMPORT_TEMPLATE_TIMES = (
    "﻿"  # UTF-8 BOM für Excel-DE
    "datum;start;ende;pause_min;projekt;notiz\r\n"
    "04.05.2026;09:00;17:30;30;Kunde A;Sprint Planning\r\n"
    "05.05.2026;08:30;17:00;45;;\r\n"
    "06.05.2026;09:00;13:00;0;;Halber Tag\r\n"
)

_IMPORT_TEMPLATE_ABSENCES = (
    "﻿"
    "art;von;bis;notiz\r\n"
    "vacation;01.07.2026;12.07.2026;Sommerurlaub\r\n"
    "sick;15.06.2026;16.06.2026;\r\n"
    "unpaid;20.08.2026;22.08.2026;Familienangelegenheit\r\n"
)


def _csv_response(content: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/import-template-times.csv")
def import_template_times():
    return _csv_response(_IMPORT_TEMPLATE_TIMES, "clok-zeiteintraege-vorlage.csv")


@router.get("/import-template-absences.csv")
def import_template_absences():
    return _csv_response(_IMPORT_TEMPLATE_ABSENCES, "clok-abwesenheiten-vorlage.csv")


@router.get("", response_model=list[UserOut])
def list_employees(
    include_offboarded: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role == Role.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    q = db.query(User)
    if user.role == Role.EMPLOYER:
        q = q.filter(User.supervisor_id == user.id)
    if not include_offboarded:
        q = q.filter(User.offboarded_at.is_(None))
    return [UserOut.model_validate(u) for u in q.order_by(User.full_name).all()]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    actor: User = Depends(require_role(Role.EMPLOYER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username bereits vergeben.")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="E-Mail bereits vergeben.")

    # Mindesturlaub-Check: § 3 BUrlG, abhängig von Arbeitstagen pro Woche.
    work_days = normalize_work_days(payload.work_days)
    legal_min = legal_min_vacation_days(work_days)
    if (
        payload.annual_vacation_days is not None
        and payload.annual_vacation_days < legal_min
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Urlaubsanspruch ({payload.annual_vacation_days}) liegt unter dem "
                f"gesetzlichen Mindestmaß ({legal_min} Tage bei {len(work_days)}-Tage-Woche)."
            ),
        )

    # Hierarchie-Check: Arbeitgeber legt nur eigene MA an, Admin alle.
    supervisor_id = payload.supervisor_id
    if actor.role == Role.EMPLOYER:
        if payload.role != Role.EMPLOYEE:
            raise HTTPException(
                status_code=403,
                detail="Arbeitgeber dürfen nur Mitarbeiter anlegen.",
            )
        supervisor_id = actor.id

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=ONBOARDING_TOKEN_VALID_DAYS)

    data = payload.model_dump(exclude={"supervisor_id", "work_days"})
    user = User(
        **data,
        work_days=work_days,
        supervisor_id=supervisor_id,
        is_active=False,  # bleibt inaktiv bis Onboarding abgeschlossen
        onboarding_token=token,
        onboarding_token_expires_at=expires_at,
    )
    db.add(user)
    db.flush()

    # Initialer Vertragseintrag (Stichtag: hire_date oder heute).
    initial_valid_from = payload.hire_date or datetime.utcnow().date()
    create_initial_terms(
        db, user, valid_from=initial_valid_from, creator_id=actor.id,
    )

    db.commit()
    db.refresh(user)

    _send_invite(db, user, actor, token)

    return UserOut.model_validate(user)


def _send_invite(db: Session, recipient: User, actor: User, token: str) -> None:
    base = get_settings().app_base_url.rstrip("/")
    link = f"{base}/onboarding/{token}"
    ctx = {
        "requester": {
            "first_name": (recipient.full_name or recipient.username).split()[0],
            "full_name": recipient.full_name or recipient.username,
            "email": recipient.email,
        },
        "approver": {
            "first_name": (actor.full_name or actor.username).split()[0],
            "full_name": actor.full_name or actor.username,
        },
        "link": link,
        "valid_days": ONBOARDING_TOKEN_VALID_DAYS,
    }
    notify(db, kind=NotificationKind.INVITE_EMPLOYEE, recipient=recipient, ctx=ctx)


@router.post("/{user_id}/resend-invite", response_model=UserOut)
def resend_invite(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _check_import_access(actor, user_id, db)
    if not target.onboarding_pending:
        raise HTTPException(
            status_code=409,
            detail="Onboarding ist bereits abgeschlossen.",
        )
    target.onboarding_token = secrets.token_urlsafe(32)
    target.onboarding_token_expires_at = (
        datetime.utcnow() + timedelta(days=ONBOARDING_TOKEN_VALID_DAYS)
    )
    db.commit()
    db.refresh(target)
    _send_invite(db, target, actor, target.onboarding_token)
    return UserOut.model_validate(target)


@router.get("/{user_id}", response_model=UserOut)
def get_employee(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_id not in visible_user_ids(actor, db):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    return UserOut.model_validate(target)


@router.patch("/{user_id}", response_model=UserOut)
def update_employee(
    user_id: int,
    payload: UserUpdate,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if not (actor.role == Role.ADMIN or supervises(actor, target)):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)


@router.post("/{user_id}/offboard", response_model=UserOut)
def offboard_employee(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if not (actor.role == Role.ADMIN or supervises(actor, target)):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    if target.offboarded_at is not None:
        raise HTTPException(status_code=409, detail="Bereits offboarded.")
    target.offboarded_at = datetime.utcnow()
    target.is_active = False
    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)


@router.post("/{user_id}/reactivate", response_model=UserOut)
def reactivate_employee(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if not (actor.role == Role.ADMIN or supervises(actor, target)):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    if target.offboarded_at is None:
        raise HTTPException(status_code=409, detail="Mitarbeiter ist nicht offboarded.")
    target.offboarded_at = None
    target.is_active = True
    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_employee(
    user_id: int,
    actor: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Endgültiges Löschen. Nur Admin und nur, wenn die Aufbewahrungsfrist
    abgelaufen ist (offboarded_at + 10 Jahre)."""
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if target.offboarded_at is None:
        raise HTTPException(
            status_code=409,
            detail="Mitarbeiter muss zuerst offboarded werden.",
        )
    earliest = target.offboarded_at + timedelta(days=HARD_DELETE_RETENTION_DAYS)
    if datetime.utcnow() < earliest:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Aufbewahrungsfrist läuft bis {earliest.date().isoformat()}. "
                "Hard-Delete vorher nicht zulässig."
            ),
        )
    db.delete(target)
    db.commit()


def _check_import_access(actor: User, target_id: int, db: Session) -> User:
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if not (actor.role == Role.ADMIN or supervises(actor, target)):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    return target


@router.post("/{user_id}/imports/times")
async def import_times_csv(
    user_id: int,
    file: UploadFile = File(...),
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _check_import_access(actor, user_id, db)
    content = await file.read()
    try:
        result = import_time_entries(db, target, content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "imported": result.imported,
        "errors": [{"line": e.line, "message": e.message} for e in result.errors],
    }


@router.post("/{user_id}/imports/absences")
async def import_absences_csv(
    user_id: int,
    file: UploadFile = File(...),
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _check_import_access(actor, user_id, db)
    content = await file.read()
    try:
        result = import_absences(db, target, actor.id, content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "imported": result.imported,
        "errors": [{"line": e.line, "message": e.message} for e in result.errors],
    }
