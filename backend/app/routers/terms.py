"""Endpoints für den Vertragsverlauf eines Mitarbeiters.

Nur Arbeitgeber/Admin dürfen Verträge ändern; der Mitarbeiter sieht
sie nur über sein eigenes Profil. Jede Änderung landet im Audit-Log.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.audit import log_change
from app.auth import get_current_user
from app.database import get_db
from app.models import (
    AuditAction, EmploymentTerms, Role, User,
)
from app.permissions import supervises, visible_user_ids
from app.schemas import TermsIn, TermsOut, TermsPatch
from app.terms import (
    apply_new_terms, list_terms, refresh_user_mirror,
)
from app.work_days import normalize as normalize_work_days

router = APIRouter(prefix="/api/employees", tags=["terms"])


def _check_target(actor: User, target_id: int, db: Session) -> User:
    """Lesezugriff: jeder Vorgesetzte des Users bzw. der User selbst."""
    if target_id not in visible_user_ids(actor, db):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    return target


def _check_target_writable(actor: User, target_id: int, db: Session) -> User:
    """Schreibzugriff: nur Admin oder direkter Supervisor."""
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden.")
    if not (actor.role == Role.ADMIN or supervises(actor, target)):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    return target


@router.get("/{user_id}/terms", response_model=list[TermsOut])
def get_terms(
    user_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _check_target(actor, user_id, db)
    return [TermsOut.model_validate(t) for t in list_terms(db, target)]


@router.post("/{user_id}/terms", response_model=TermsOut, status_code=status.HTTP_201_CREATED)
def post_terms(
    user_id: int,
    payload: TermsIn,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _check_target_writable(actor, user_id, db)

    # Eindeutigkeit valid_from prüfen
    existing = (
        db.query(EmploymentTerms)
        .filter(
            EmploymentTerms.user_id == target.id,
            EmploymentTerms.valid_from == payload.valid_from,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Es existiert bereits ein Vertrag mit Stichtag {payload.valid_from}.",
        )

    fields = payload.model_dump(exclude={"valid_from", "note"}, exclude_unset=True)
    if "work_days" in fields and fields["work_days"] is not None:
        fields["work_days"] = normalize_work_days(fields["work_days"])

    new_terms = apply_new_terms(
        db, target,
        valid_from=payload.valid_from,
        fields=fields,
        creator_id=actor.id,
        note=payload.note,
    )
    log_change(
        db,
        actor_user_id=actor.id,
        action=AuditAction.CREATE,
        entity_type="employment_terms",
        entity_id=new_terms.id,
        after=new_terms,
    )
    db.commit()
    db.refresh(new_terms)
    return TermsOut.model_validate(new_terms)


@router.patch("/{user_id}/terms/{terms_id}", response_model=TermsOut)
def patch_terms(
    user_id: int,
    terms_id: int,
    payload: TermsPatch,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _check_target_writable(actor, user_id, db)
    terms = db.query(EmploymentTerms).filter(
        EmploymentTerms.id == terms_id,
        EmploymentTerms.user_id == target.id,
    ).first()
    if terms is None:
        raise HTTPException(status_code=404, detail="Vertragseintrag nicht gefunden.")

    before_snapshot = {c.name: getattr(terms, c.name) for c in terms.__table__.columns}

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "work_days" and value is not None:
            value = normalize_work_days(value)
        setattr(terms, field, value)

    db.flush()
    refresh_user_mirror(db, target)
    log_change(
        db,
        actor_user_id=actor.id,
        action=AuditAction.UPDATE,
        entity_type="employment_terms",
        entity_id=terms.id,
        before=before_snapshot,
        after=terms,
    )
    db.commit()
    db.refresh(terms)
    return TermsOut.model_validate(terms)


@router.delete("/{user_id}/terms/{terms_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_terms(
    user_id: int,
    terms_id: int,
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = _check_target_writable(actor, user_id, db)
    terms = db.query(EmploymentTerms).filter(
        EmploymentTerms.id == terms_id,
        EmploymentTerms.user_id == target.id,
    ).first()
    if terms is None:
        raise HTTPException(status_code=404, detail="Vertragseintrag nicht gefunden.")

    # Den allerletzten Vertrag nicht löschen – sonst hängt der User
    # ohne gültige Vertragsdaten.
    count = db.query(EmploymentTerms).filter(
        EmploymentTerms.user_id == target.id,
    ).count()
    if count <= 1:
        raise HTTPException(
            status_code=409,
            detail="Der letzte Vertragseintrag kann nicht gelöscht werden.",
        )

    before_snapshot = {c.name: getattr(terms, c.name) for c in terms.__table__.columns}
    log_change(
        db,
        actor_user_id=actor.id,
        action=AuditAction.DELETE,
        entity_type="employment_terms",
        entity_id=terms.id,
        before=before_snapshot,
    )
    db.delete(terms)
    db.flush()
    refresh_user_mirror(db, target)
    db.commit()
