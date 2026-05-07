"""Admin-Verwaltung der Arbeitgeber-Invites.

Vier Endpoints:
- POST /api/admin/employer-invites               – neuen Invite anlegen
- GET  /api/admin/employer-invites               – auflisten (mit Filter)
- DELETE /api/admin/employer-invites/{id}        – zurückziehen
- POST /api/admin/employer-invites/{id}/resend   – Mail erneut senden,
                                                   bei Abgelaufenem
                                                   Token rotieren

Klartext-Token wird ausschließlich in der Create-Response (und in der
Resend-Response, falls rotiert) zurückgegeben. In der DB liegt nur der
SHA-256-Hash. Der Versand passiert direkt über `resend.send()` – die
allgemeine `notify()`-Pipeline scheidet aus, weil der Empfänger noch
keinen User-Datensatz hat.
"""
from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import EmployerInvite, Role, User
from app.notifications import resend
from app.notifications.service import render_template
from app.onboarding_tokens import generate_invite_token, hash_invite_token
from app.permissions import require_role
from app.schemas import (
    EmployerInviteCreatedOut, EmployerInviteIn, EmployerInviteOut,
    EmployerInviteResendOut,
)

router = APIRouter(prefix="/api/admin/employer-invites", tags=["admin-invites"])

_StatusFilter = Literal["pending", "accepted", "expired", "revoked", "all"]


def _derive_status(inv: EmployerInvite, now: Optional[datetime] = None) -> str:
    now = now or datetime.utcnow()
    if inv.revoked_at is not None:
        return "revoked"
    if inv.accepted_at is not None:
        return "accepted"
    if inv.expires_at < now:
        return "expired"
    return "pending"


def _to_out(inv: EmployerInvite) -> EmployerInviteOut:
    return EmployerInviteOut(
        id=inv.id,
        email=inv.email,
        full_name=inv.full_name,
        company_name=inv.company_name,
        status=_derive_status(inv),
        expires_at=inv.expires_at,
        created_at=inv.created_at,
        created_by_admin_id=inv.created_by_admin_id,
        accepted_at=inv.accepted_at,
        accepted_by_user_id=inv.accepted_by_user_id,
        revoked_at=inv.revoked_at,
        revoked_by_admin_id=inv.revoked_by_admin_id,
        last_resent_at=inv.last_resent_at,
        resent_by_admin_id=inv.resent_by_admin_id,
    )


def _build_link(plaintext_token: str) -> str:
    base = get_settings().app_base_url.rstrip("/")
    return f"{base}/onboarding/invite/{plaintext_token}"


def _first_name_from(full_name: Optional[str]) -> str:
    if not full_name:
        return ""
    return full_name.split()[0]


def _send_invite_mail(
    *, recipient_email: str, recipient_first_name: str, link: str, valid_days: int,
) -> None:
    subject = "Du wurdest zu Clok eingeladen"
    text, html = render_template("employer_invite", {
        "subject": subject,
        "recipient_first_name": recipient_first_name,
        "link": link,
        "valid_days": valid_days,
    })
    resend.send(to=recipient_email, subject=subject, html=html, text=text)


@router.post("", response_model=EmployerInviteCreatedOut,
             status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: EmployerInviteIn,
    actor: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    settings = get_settings()

    # Pre-Check: existiert bereits ein Konto unter dieser E-Mail?
    # Dann ist der Invite kein gangbarer Weg – User soll direkt
    # befördert werden (späterer Endpoint).
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Für diese E-Mail existiert bereits ein Konto. Wenn der "
                "User Arbeitgeber-Rechte braucht, befördere ihn statt "
                "eines neuen Invites."
            ),
        )

    plaintext = generate_invite_token()
    invite = EmployerInvite(
        email=payload.email,
        full_name=payload.full_name,
        company_name=payload.company_name,
        token_hash=hash_invite_token(plaintext),
        expires_at=datetime.utcnow() + timedelta(days=settings.employer_invite_ttl_days),
        created_by_admin_id=actor.id,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    link = _build_link(plaintext)
    _send_invite_mail(
        recipient_email=payload.email,
        recipient_first_name=_first_name_from(payload.full_name),
        link=link,
        valid_days=settings.employer_invite_ttl_days,
    )

    return EmployerInviteCreatedOut(
        invite=_to_out(invite),
        plaintext_token=plaintext,
        onboarding_url=link,
    )


@router.get("", response_model=list[EmployerInviteOut])
def list_invites(
    status_filter: _StatusFilter = Query("all", alias="status"),
    actor: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    rows = db.query(EmployerInvite).order_by(EmployerInvite.created_at.desc()).all()
    out = [_to_out(r) for r in rows]
    if status_filter != "all":
        out = [o for o in out if o.status == status_filter]
    return out


@router.get("/{invite_id}", response_model=EmployerInviteOut)
def get_invite(
    invite_id: int,
    actor: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    inv = db.query(EmployerInvite).filter(EmployerInvite.id == invite_id).first()
    if inv is None:
        raise HTTPException(404, "Invite nicht gefunden.")
    return _to_out(inv)


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: int,
    actor: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    inv = db.query(EmployerInvite).filter(EmployerInvite.id == invite_id).first()
    if inv is None:
        raise HTTPException(404, "Invite nicht gefunden.")
    if inv.accepted_at is not None:
        raise HTTPException(409, "Invite wurde bereits eingelöst und kann nicht zurückgezogen werden.")
    if inv.revoked_at is not None:
        # Idempotent: nochmal revoke = no-op, 204
        return
    inv.revoked_at = datetime.utcnow()
    inv.revoked_by_admin_id = actor.id
    db.commit()


@router.post("/{invite_id}/resend", response_model=EmployerInviteResendOut)
def resend_invite(
    invite_id: int,
    actor: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Sendet die Einladung erneut. Token wird IMMER rotiert – der alte
    Klartext-Link aus dem Create-Moment ist danach tot. Der neue Link
    landet ausschließlich in der Mail beim Empfänger; in der Response
    erscheint er nicht (sonst hätte ein zweiter Admin via Resend Zugriff
    auf einen Link, den nur der erstellende Admin sehen sollte)."""
    settings = get_settings()
    inv = db.query(EmployerInvite).filter(EmployerInvite.id == invite_id).first()
    if inv is None:
        raise HTTPException(404, "Invite nicht gefunden.")
    if inv.accepted_at is not None:
        raise HTTPException(409, "Invite wurde bereits eingelöst.")
    if inv.revoked_at is not None:
        raise HTTPException(409, "Invite wurde zurückgezogen – bitte einen neuen anlegen.")

    now = datetime.utcnow()
    plaintext = generate_invite_token()
    inv.token_hash = hash_invite_token(plaintext)
    inv.expires_at = now + timedelta(days=settings.employer_invite_ttl_days)
    inv.last_resent_at = now
    inv.resent_by_admin_id = actor.id
    db.commit()
    db.refresh(inv)

    _send_invite_mail(
        recipient_email=inv.email,
        recipient_first_name=_first_name_from(inv.full_name),
        link=_build_link(plaintext),
        valid_days=settings.employer_invite_ttl_days,
    )

    return EmployerInviteResendOut(
        invite=_to_out(inv),
        expires_extended=True,
    )
