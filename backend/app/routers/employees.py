"""Mitarbeiter-Verwaltung: Anlegen, Auflisten, Stammdaten ändern, CSV-Import,
Offboarding/Reactivate und Hard-Delete (Admin)."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password
from app.database import get_db
from app.importers.time_entries_csv import import_time_entries
from app.models import Role, User
from app.permissions import require_role, supervises, visible_user_ids
from app.schemas import EmployeeCreate, UserOut, UserUpdate


HARD_DELETE_RETENTION_DAYS = 365 * 10  # 10 Jahre Aufbewahrung

router = APIRouter(prefix="/api/employees", tags=["employees"])


_IMPORT_TEMPLATE = (
    "﻿"  # UTF-8 BOM für Excel-DE
    "datum;start;ende;pause_min;projekt;notiz\r\n"
    "04.05.2026;09:00;17:30;30;Kunde A;Sprint Planning\r\n"
    "05.05.2026;08:30;17:00;45;;\r\n"
    "06.05.2026;09:00;13:00;0;;Halber Tag\r\n"
)


@router.get("/import-template.csv")
def import_template():
    """CSV-Vorlage zum Download. Kein Auth nötig – Inhalt ist statisch
    und enthält nur Beispiel-Werte."""
    return Response(
        content=_IMPORT_TEMPLATE,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="clok-zeiteintraege-vorlage.csv"',
            "Cache-Control": "public, max-age=3600",
        },
    )


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

    # Hierarchie-Check: Arbeitgeber legt nur eigene MA an, Admin alle.
    supervisor_id = payload.supervisor_id
    if actor.role == Role.EMPLOYER:
        if payload.role != Role.EMPLOYEE:
            raise HTTPException(
                status_code=403,
                detail="Arbeitgeber dürfen nur Mitarbeiter anlegen.",
            )
        supervisor_id = actor.id
    elif actor.role == Role.ADMIN and supervisor_id is None:
        # Admin legt Arbeitgeber an oder Mitarbeiter ohne expliziten Vorgesetzten:
        # supervisor bleibt None (= System-Admin).
        pass

    data = payload.model_dump(exclude={"password", "supervisor_id"})
    user = User(
        **data,
        password_hash=hash_password(payload.password),
        supervisor_id=supervisor_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


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


@router.post("/{user_id}/imports")
async def import_csv(
    user_id: int,
    file: UploadFile = File(...),
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if not (actor.role == Role.ADMIN or supervises(actor, target)):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")

    content = await file.read()
    try:
        result = import_time_entries(db, target, content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "imported": result.imported,
        "errors": [{"line": e.line, "message": e.message} for e in result.errors],
    }
