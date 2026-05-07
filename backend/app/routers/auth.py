"""Auth router: login + self-service profile + password reset."""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.auth import authenticate_user, create_access_token, get_current_user, hash_password, verify_password
from app.config import get_settings
from app.database import get_db
from app.models import Role, User
from app.notifications import resend
from app.notifications.service import NotificationKind, notify
from app.permissions import require_active_user, require_role
from app.schemas import Token, UserOut, UserUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])

PASSWORD_RESET_TTL_MINUTES = 60


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    password: str = Field(min_length=8)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


class ResetPreviewOut(BaseModel):
    username: str
    email: EmailStr


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falscher Benutzername oder Passwort",
        )
    return Token(access_token=create_access_token(user.username))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# Whitelist je Rolle: was darf ein User an seinem eigenen Datensatz
# ändern? Beschäftigungs- und vertragliche Felder (hire_date,
# federal_state, weekly_hours, billing_mode, hourly_rate_eur, supervisor,
# work_days, …) sind absichtlich NICHT enthalten – die laufen über den
# Vertragsverlauf bzw. den Arbeitgeber.
_EMPLOYEE_SELF_EDITABLE = frozenset({
    # Identität & Kontakt
    "full_name", "email", "phone", "date_of_birth",
    # Privatanschrift
    "address_line1", "address_line2", "postal_code", "city", "country",
    # Lohn-relevante Stammdaten + Notfall
    "social_security_number", "iban",
    "emergency_contact_name", "emergency_contact_phone",
})
_EMPLOYER_SELF_EDITABLE = frozenset({
    # Identität & Kontakt
    "full_name", "email", "phone", "date_of_birth",
    # Firma + HR-Ansprechpartner
    "company_name", "company_address_line1", "company_address_line2",
    "company_postal_code", "company_city", "company_country",
    "hr_contact_name", "hr_contact_email", "hr_contact_phone",
})
_ADMIN_SELF_EDITABLE = frozenset({
    "full_name", "email", "phone", "date_of_birth",
})


def _self_edit_whitelist(role: Role) -> frozenset[str]:
    if role == Role.EMPLOYEE:
        return _EMPLOYEE_SELF_EDITABLE
    if role == Role.EMPLOYER:
        return _EMPLOYER_SELF_EDITABLE
    return _ADMIN_SELF_EDITABLE


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    incoming = payload.model_dump(exclude_unset=True)
    allowed = _self_edit_whitelist(user.role)
    forbidden = sorted(f for f in incoming if f not in allowed)
    if forbidden:
        # Fail-loud: das Frontend zeigt diese Felder dem User gar nicht
        # erst zum Bearbeiten an. Wenn ein direkter API-Call sie doch
        # mitschickt, soll er klar abgewiesen werden – kein stilles
        # Verschlucken, sonst entstehen schwer auffindbare Bugs.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Diese Felder darfst du nicht selbst ändern, "
                "sondern nur über deinen Arbeitgeber bzw. den "
                f"Vertragsverlauf: {', '.join(forbidden)}."
            ),
        )

    for field, value in incoming.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    """Erzeugt einen Reset-Token, falls die E-Mail bekannt ist, und schickt
    eine Mail. Antwortet immer 204, egal ob die Adresse existiert –
    so können Angreifer nicht durch Antwortzeit/Status auf existierende
    Konten schließen."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not user.is_active or user.offboarded_at is not None:
        return  # silent success

    token = secrets.token_urlsafe(32)
    user.password_reset_token = token
    user.password_reset_token_expires_at = (
        datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES)
    )
    db.commit()

    base = get_settings().app_base_url.rstrip("/")
    link = f"{base}/reset-password/{token}"
    first_name = (user.full_name or user.username).split()[0]
    ctx = {
        "requester": {
            "first_name": first_name,
            "full_name": user.full_name or user.username,
            "email": user.email,
        },
        "approver": {"first_name": ""},
        "link": link,
        "valid_minutes": PASSWORD_RESET_TTL_MINUTES,
    }
    notify(db, kind=NotificationKind.PASSWORD_RESET, recipient=user, ctx=ctx)


def _load_reset_user(token: str, db: Session) -> User:
    user = db.query(User).filter(User.password_reset_token == token).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Link ungültig.")
    if (
        user.password_reset_token_expires_at is None
        or user.password_reset_token_expires_at < datetime.utcnow()
    ):
        raise HTTPException(
            status_code=410,
            detail="Link ist abgelaufen. Fordere einen neuen Reset an.",
        )
    return user


@router.get("/reset-password/{token}", response_model=ResetPreviewOut)
def reset_password_preview(token: str, db: Session = Depends(get_db)):
    user = _load_reset_user(token, db)
    return ResetPreviewOut(username=user.username, email=user.email)


@router.post("/reset-password/{token}", status_code=status.HTTP_204_NO_CONTENT)
def reset_password_complete(
    token: str,
    payload: ResetPasswordIn,
    db: Session = Depends(get_db),
):
    user = _load_reset_user(token, db)
    user.password_hash = hash_password(payload.password)
    user.password_reset_token = None
    user.password_reset_token_expires_at = None
    db.commit()


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.password_hash is None or not verify_password(
        payload.old_password, user.password_hash
    ):
        raise HTTPException(status_code=401, detail="Altes Passwort stimmt nicht.")
    user.password_hash = hash_password(payload.new_password)
    db.commit()


class TestEmailOut(BaseModel):
    dev_mode: bool
    success: bool
    sent_to: EmailStr
    from_address: str
    message_id: Optional[str] = None
    status_code: Optional[int] = None
    error_name: Optional[str] = None
    error_message: Optional[str] = None


@router.post("/test-email", response_model=TestEmailOut)
def send_test_email(
    user: User = Depends(require_role(Role.ADMIN, Role.EMPLOYER)),
):
    """Schickt eine Test-Mail an die eigene Adresse, durchläuft die echte
    Resend-Pipeline. Verrät, ob das System gerade im Dev-Modus läuft
    oder live versendet."""
    settings = get_settings()
    first_name = (user.full_name or user.username).split()[0]
    text = (
        f"Hi {first_name},\n\n"
        f"das ist eine Test-Mail von deinem Clok-System.\n"
        f"Wenn du sie liest, ist der Mailversand richtig konfiguriert.\n\n"
        f"Absender: {settings.resend_from_email}\n"
        f"App-URL: {settings.app_base_url}\n\n"
        f"– Clok\n"
    )
    html = (
        f"<p>Hi {first_name},</p>"
        f"<p>das ist eine Test-Mail von deinem Clok-System. "
        f"Wenn du sie liest, ist der Mailversand richtig konfiguriert.</p>"
        f"<p style='color:#888;font-size:14px;'>"
        f"Absender: <code>{settings.resend_from_email}</code><br>"
        f"App-URL: <code>{settings.app_base_url}</code></p>"
        f"<p>– Clok</p>"
    )
    result = resend.send(
        to=user.email,
        subject="Clok – Test-Mail",
        html=html,
        text=text,
    )
    return TestEmailOut(
        dev_mode=result.dev_mode,
        success=result.ok,
        sent_to=user.email,
        from_address=settings.resend_from_email,
        message_id=result.message_id,
        status_code=result.status_code,
        error_name=result.error_name,
        error_message=result.error_message,
    )
