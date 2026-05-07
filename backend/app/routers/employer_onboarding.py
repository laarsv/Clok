"""Arbeitgeber-Onboarding-Wizard (5 Schritte).

Endpoints unter /api/onboarding:
- GET  /invite/{token}            (öffentlich, Token-Preview)
- POST /invite/{token}/accept     (öffentlich, Step 1 + JWT)
- GET  /status                    (auth, eigener Status)
- POST /company                   (auth, Step 2)
- POST /defaults                  (auth, Step 3)
- POST /complete                  (auth, Step 5)

Wichtig: in main.py muss dieser Router VOR dem alten
`onboarding.router` (Mitarbeiter-Onboarding mit /api/onboarding/{token})
registriert werden, sonst werden literale Pfade wie /api/onboarding/status
fälschlich als token=status gegen den alten Router gematcht.

Race-Schutz beim Accept: Der Invite wird mit `with_for_update()`
gelesen. Zwei parallele Accept-Requests auf denselben Token landen
seriell – der zweite sieht `accepted_at IS NOT NULL` und kriegt 409.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password
from app.config import get_settings
from app.database import get_db
from app.models import (
    BillingMode, Company, EmployerInvite, OnboardingStatus, Role, User,
)
from app.notifications import resend
from app.notifications.service import NotificationKind, notify, render_template
from app.onboarding_tokens import hash_invite_token
from app.schemas import (
    InviteAcceptIn, InviteAcceptOut, InvitePreviewOut, OnboardingCompanyIn,
    OnboardingDefaultsIn, OnboardingStatusOut, Token, UserOut,
)

router = APIRouter(prefix="/api/onboarding", tags=["employer-onboarding"])


# Mapping Status → Frontend-Pfad. Wird vom OnboardingGuard im FE
# benutzt, um den User auf den richtigen Schritt zu leiten.
_NEXT_STEP_PATH = {
    OnboardingStatus.STEP_2: "/onboarding/company",
    OnboardingStatus.STEP_3: "/onboarding/defaults",
    OnboardingStatus.STEP_4: "/onboarding/first-employee",
    OnboardingStatus.STEP_5: "/onboarding/done",
}


def _load_invite_for_update(token_plain: str, db: Session) -> EmployerInvite:
    """Sperrt die Invite-Zeile mit FOR UPDATE und prüft den Status.

    HTTP-Codes (siehe docs/onboarding-flow.md §4.2):
    - 404 Token nicht gefunden
    - 410 abgelaufen oder zurückgezogen
    - 409 bereits eingelöst
    """
    h = hash_invite_token(token_plain)
    inv = (
        db.query(EmployerInvite)
        .filter(EmployerInvite.token_hash == h)
        .with_for_update()
        .first()
    )
    if inv is None:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden.")
    if inv.revoked_at is not None:
        raise HTTPException(status_code=410, detail="Einladung wurde zurückgezogen.")
    if inv.accepted_at is not None:
        raise HTTPException(status_code=409, detail="Einladung wurde bereits eingelöst.")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Einladung ist abgelaufen.")
    return inv


def _send_admin_started_mail(db: Session, new_user: User, inviter: Optional[User], company_name: Optional[str]) -> None:
    """Mail an alle Admins: ein eingeladener Arbeitgeber hat Step 1 abgeschlossen."""
    admins = db.query(User).filter(
        User.role == Role.ADMIN,
        User.is_active.is_(True),
    ).all()
    inviter_full = (inviter.full_name or inviter.username) if inviter else "Admin"
    for admin in admins:
        admin_first = (admin.full_name or admin.username).split()[0]
        ctx = {
            "admin_first_name": admin_first,
            "employer_full_name": new_user.full_name or new_user.username,
            "employer_email": new_user.email,
            "company_name": company_name,
            "inviter_full_name": inviter_full,
            # notify() braucht diese Felder zum Subject-Format und Setting-Lookup
            "requester": {"full_name": new_user.full_name or new_user.username, "first_name": ""},
            "approver": {"first_name": admin_first},
        }
        notify(
            db,
            kind=NotificationKind.ADMIN_EMPLOYER_ONBOARDING_STARTED,
            recipient=admin,
            ctx=ctx,
        )


def _send_admin_completed_mail(db: Session, employer: User, company: Company) -> None:
    admins = db.query(User).filter(
        User.role == Role.ADMIN,
        User.is_active.is_(True),
    ).all()
    bundesland = company.bundesland.value if company.bundesland else "—"
    bucket = company.employee_count_bucket.value if company.employee_count_bucket else None
    for admin in admins:
        admin_first = (admin.full_name or admin.username).split()[0]
        ctx = {
            "admin_first_name": admin_first,
            "employer_full_name": employer.full_name or employer.username,
            "company_name": company.name,
            "bundesland": bundesland,
            "employee_count_bucket": bucket,
            "requester": {"full_name": employer.full_name or employer.username, "first_name": ""},
            "approver": {"first_name": admin_first},
        }
        notify(
            db,
            kind=NotificationKind.ADMIN_EMPLOYER_ONBOARDING_COMPLETED,
            recipient=admin,
            ctx=ctx,
        )


def _send_welcome_mail(employer: User, company: Company) -> None:
    settings = get_settings()
    first = (employer.full_name or employer.username).split()[0]
    subject = "Willkommen bei Clok – euer Onboarding ist durch"
    text, html = render_template("welcome_employer", {
        "subject": subject,
        "employer_first_name": first,
        "company_name": company.name,
        "link": f"{settings.app_base_url.rstrip('/')}/employer",
    })
    resend.send(to=employer.email, subject=subject, html=html, text=text)


# ---------- Public (Token-basiert) ----------

@router.get("/invite/{token}", response_model=InvitePreviewOut)
def preview_invite(token: str, db: Session = Depends(get_db)):
    """Token validieren, vorausgefüllte Felder zurückgeben."""
    h = hash_invite_token(token)
    inv = db.query(EmployerInvite).filter(EmployerInvite.token_hash == h).first()
    if inv is None:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden.")
    if inv.revoked_at is not None:
        raise HTTPException(status_code=410, detail="Einladung wurde zurückgezogen.")
    if inv.accepted_at is not None:
        raise HTTPException(status_code=409, detail="Einladung wurde bereits eingelöst.")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Einladung ist abgelaufen.")
    return InvitePreviewOut(
        email=inv.email,
        full_name=inv.full_name,
        company_name=inv.company_name,
    )


@router.post("/invite/{token}/accept", response_model=InviteAcceptOut,
             status_code=status.HTTP_201_CREATED)
def accept_invite(
    token: str, payload: InviteAcceptIn, db: Session = Depends(get_db),
):
    if not payload.accept_terms:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Datenschutz-/AGB-Zustimmung ist Pflicht.",
        )

    inv = _load_invite_for_update(token, db)

    # Username + E-Mail-Konflikt prüfen
    if db.query(User).filter(User.username == payload.username).first() is not None:
        raise HTTPException(409, "Dieser Username ist schon vergeben.")
    if db.query(User).filter(User.email == inv.email).first() is not None:
        raise HTTPException(409, "Für diese E-Mail existiert bereits ein Konto.")

    now = datetime.utcnow()
    # billing_mode am Arbeitgeber-User ist abrechnungs-irrelevant – Arbeitgeber
    # erfassen keine eigene Zeit für eigene Abrechnung. SALARY als Platzhalter.
    new_user = User(
        username=payload.username,
        email=inv.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=Role.EMPLOYER,
        is_active=True,
        billing_mode=BillingMode.SALARY,
        onboarding_status=OnboardingStatus.STEP_2,
        email_verified_at=now,
    )
    db.add(new_user)
    db.flush()  # für new_user.id

    inv.accepted_at = now
    inv.accepted_by_user_id = new_user.id
    db.commit()
    db.refresh(new_user)

    inviter = db.query(User).filter(User.id == inv.created_by_admin_id).first() \
        if inv.created_by_admin_id else None
    _send_admin_started_mail(db, new_user, inviter, inv.company_name)

    access = create_access_token(new_user.username)
    return InviteAcceptOut(
        user=UserOut.model_validate(new_user, from_attributes=True),
        token=Token(access_token=access),
    )


# ---------- Auth (Wizard-User) ----------

def _next_step_path(user_status: OnboardingStatus) -> Optional[str]:
    return _NEXT_STEP_PATH.get(user_status)


@router.get("/status", response_model=OnboardingStatusOut)
def my_status(user: User = Depends(get_current_user)):
    return OnboardingStatusOut(
        onboarding_status=user.onboarding_status,
        next_step=_next_step_path(user.onboarding_status),
    )


def _require_status(user: User, expected: OnboardingStatus) -> None:
    if user.onboarding_status != expected:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Falscher Schritt: erwartet {expected.value}, "
                f"aktuell {user.onboarding_status.value}."
            ),
        )


@router.post("/company", response_model=OnboardingStatusOut)
def post_company(
    payload: OnboardingCompanyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_status(user, OnboardingStatus.STEP_2)

    # Falls schon eine Firma verlinkt ist (sollte hier nicht sein,
    # aber defensiv): updaten statt neu anlegen.
    company = (
        db.query(Company).filter(Company.id == user.company_id).first()
        if user.company_id else None
    )
    if company is None:
        company = Company(
            name=payload.name,
            created_by_user_id=user.id,
        )
        db.add(company)
        db.flush()
        user.company_id = company.id
    else:
        company.name = payload.name

    company.address_street = payload.address_street
    company.address_zip = payload.address_zip
    company.address_city = payload.address_city
    company.address_country = payload.address_country
    company.vat_id = payload.vat_id
    company.bundesland = payload.bundesland
    # Default-Bundesland mit Firmen-Bundesland vorbelegen, falls nicht
    # gesetzt – Step 3 darf das nochmal überschreiben.
    if company.default_bundesland is None:
        company.default_bundesland = payload.bundesland
    company.industry = payload.industry
    company.employee_count_bucket = payload.employee_count_bucket

    user.onboarding_status = OnboardingStatus.STEP_3
    db.commit()
    db.refresh(user)

    return OnboardingStatusOut(
        onboarding_status=user.onboarding_status,
        next_step=_next_step_path(user.onboarding_status),
    )


@router.post("/defaults", response_model=OnboardingStatusOut)
def post_defaults(
    payload: OnboardingDefaultsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_status(user, OnboardingStatus.STEP_3)

    if user.company_id is None:
        # Soll im normalen Flow nicht passieren (Step 2 setzt company_id).
        raise HTTPException(409, "Firmendaten fehlen – bitte Schritt 2 wiederholen.")
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if company is None:
        raise HTTPException(409, "Firmendaten fehlen – bitte Schritt 2 wiederholen.")

    company.default_weekly_hours = payload.default_weekly_hours
    company.default_vacation_days = payload.default_vacation_days
    company.default_bundesland = payload.default_bundesland
    company.default_billing_mode = payload.default_billing_mode

    user.onboarding_status = OnboardingStatus.STEP_4
    db.commit()
    db.refresh(user)

    return OnboardingStatusOut(
        onboarding_status=user.onboarding_status,
        next_step=_next_step_path(user.onboarding_status),
    )


@router.post("/complete", response_model=OnboardingStatusOut)
def post_complete(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Step 5. Akzeptiert sowohl `step_4` (User hat ersten MA übersprungen)
    als auch `step_5` (User hat einen MA angelegt und kommt zurück)."""
    if user.onboarding_status not in (OnboardingStatus.STEP_4, OnboardingStatus.STEP_5):
        raise HTTPException(
            status_code=409,
            detail=f"Falscher Schritt: aktuell {user.onboarding_status.value}.",
        )

    company = db.query(Company).filter(Company.id == user.company_id).first() \
        if user.company_id else None
    if company is None:
        raise HTTPException(409, "Firmendaten fehlen – bitte Schritt 2 wiederholen.")

    user.onboarding_status = OnboardingStatus.ACTIVE
    db.commit()
    db.refresh(user)

    _send_welcome_mail(user, company)
    _send_admin_completed_mail(db, user, company)

    return OnboardingStatusOut(
        onboarding_status=user.onboarding_status,
        next_step=None,
    )
