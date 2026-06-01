"""Projekte: vom Arbeitgeber verwaltete Liste, auf die Zeiteinträge gebucht
werden. Mitarbeiter wählen aus den Projekten ihres Vorgesetzten."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from datetime import datetime

from app.audit import log_change
from app.database import get_db
from app.models import AuditAction, Project, Role, User
from app.permissions import require_active_user, require_role
from app.schemas import ProjectIn, ProjectOut

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _owner_id_for(user: User) -> Optional[int]:
    """Besitzer-Kontext eines Users: Arbeitgeber → self, Mitarbeiter →
    Vorgesetzter. Admin → None (sieht alle)."""
    if user.role == Role.EMPLOYER:
        return user.id
    if user.role == Role.EMPLOYEE:
        return user.supervisor_id
    return None


def _to_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        owner_user_id=p.owner_user_id,
        name=p.name,
        client=p.client,
        color=p.color,
        hours_budget=p.hours_budget,
        archived=p.archived_at is not None,
        created_at=p.created_at,
    )


def _load_owned(project_id: int, user: User, db: Session) -> Project:
    """Lädt ein Projekt und stellt sicher, dass der User es verwalten darf."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden.")
    if user.role != Role.ADMIN and project.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(
    include_archived: bool = Query(False),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    q = db.query(Project)
    owner_id = _owner_id_for(user)
    if owner_id is not None:
        q = q.filter(Project.owner_user_id == owner_id)
    elif user.role != Role.ADMIN:
        # Mitarbeiter ohne Vorgesetzten hat keine auswählbaren Projekte.
        return []
    if not include_archived:
        q = q.filter(Project.archived_at.is_(None))
    return [_to_out(p) for p in q.order_by(Project.name.asc()).all()]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectIn,
    user: User = Depends(require_role(Role.EMPLOYER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    project = Project(
        owner_user_id=user.id,
        name=payload.name.strip(),
        client=(payload.client or None),
        color=(payload.color or None),
        hours_budget=payload.hours_budget,
        archived_at=datetime.utcnow() if payload.archived else None,
        created_by=user.id,
    )
    db.add(project)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Projektname existiert bereits.")
    log_change(db, actor_user_id=user.id, action=AuditAction.CREATE,
               entity_type="project", entity_id=project.id, after=project)
    db.commit()
    db.refresh(project)
    return _to_out(project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectIn,
    user: User = Depends(require_role(Role.EMPLOYER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    project = _load_owned(project_id, user, db)
    before = {c.name: getattr(project, c.name) for c in project.__table__.columns}

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        project.name = data["name"].strip()
    if "client" in data:
        project.client = data["client"] or None
    if "color" in data:
        project.color = data["color"] or None
    if "hours_budget" in data:
        project.hours_budget = data["hours_budget"]
    if "archived" in data:
        project.archived_at = datetime.utcnow() if data["archived"] else None

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Projektname existiert bereits.")
    log_change(db, actor_user_id=user.id, action=AuditAction.UPDATE,
               entity_type="project", entity_id=project.id, before=before, after=project)
    db.commit()
    db.refresh(project)
    return _to_out(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    user: User = Depends(require_role(Role.EMPLOYER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    project = _load_owned(project_id, user, db)
    before = {c.name: getattr(project, c.name) for c in project.__table__.columns}
    log_change(db, actor_user_id=user.id, action=AuditAction.DELETE,
               entity_type="project", entity_id=project.id, before=before)
    # Zeiteinträge behalten ihre Stunden, verlieren nur die Projekt-Verknüpfung
    # (FK ondelete SET NULL).
    db.delete(project)
    db.commit()
