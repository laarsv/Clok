"""Mitarbeiter-Verwaltung: Anlegen, Auflisten, Stammdaten ändern, CSV-Import."""
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, hash_password
from app.database import get_db
from app.importers.time_entries_csv import import_time_entries
from app.models import Role, User
from app.permissions import require_role, supervises, visible_user_ids
from app.schemas import EmployeeCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/employees", tags=["employees"])


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
