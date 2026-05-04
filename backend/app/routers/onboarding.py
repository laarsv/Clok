"""Self-Service-Onboarding: der Mitarbeiter setzt Passwort und persönliche Daten.

Token wird beim Anlegen durch Arbeitgeber/Admin erzeugt und per Mail
verschickt. Gültigkeit: 7 Tage. Endpoints sind ÖFFENTLICH (kein JWT
nötig), Authentifizierung passiert über den Token.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import get_db
from app.models import User
from app.schemas import OnboardingComplete, OnboardingPreview, UserOut

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


def _load_pending(token: str, db: Session) -> User:
    user = db.query(User).filter(User.onboarding_token == token).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Einladung ungültig.")
    if user.onboarding_token_expires_at and user.onboarding_token_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=410,
            detail="Einladung ist abgelaufen. Bitte beim Arbeitgeber neu anfordern.",
        )
    return user


@router.get("/{token}", response_model=OnboardingPreview)
def preview(token: str, db: Session = Depends(get_db)):
    user = _load_pending(token, db)
    employer = (
        db.query(User).filter(User.id == user.supervisor_id).first()
        if user.supervisor_id else None
    )
    return OnboardingPreview(
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        employer_name=(employer.full_name or employer.username) if employer else None,
    )


@router.post("/{token}/complete", response_model=UserOut)
def complete(token: str, payload: OnboardingComplete, db: Session = Depends(get_db)):
    user = _load_pending(token, db)

    user.password_hash = hash_password(payload.password)
    for field, value in payload.model_dump(exclude={"password"}, exclude_unset=True).items():
        setattr(user, field, value)

    user.onboarding_token = None
    user.onboarding_token_expires_at = None
    user.is_active = True
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
