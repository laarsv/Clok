"""Admin-Diagnose-Endpoints. Aktuell nur Mail-Test."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Role, User
from app.notifications import resend
from app.permissions import require_role

router = APIRouter(prefix="/api/admin", tags=["admin"])


class TestEmailIn(BaseModel):
    to: EmailStr
    subject: Optional[str] = None


class TestEmailOut(BaseModel):
    dev_mode: bool
    success: bool
    sent_to: EmailStr
    from_address: str
    message_id: Optional[str] = None
    status_code: Optional[int] = None
    error_name: Optional[str] = None
    error_message: Optional[str] = None


def _build_test_body(settings, requested_by: str) -> tuple[str, str]:
    text = (
        f"Test-Mail von Clok\n\n"
        f"Absender: {settings.resend_from_email}\n"
        f"App-URL: {settings.app_base_url}\n"
        f"Ausgelöst von: {requested_by}\n\n"
        f"Wenn du diese Mail liest, ist der Mailversand richtig konfiguriert.\n\n"
        f"– Clok\n"
    )
    html = (
        f"<p><strong>Test-Mail von Clok</strong></p>"
        f"<p style='color:#888;font-size:14px;'>"
        f"Absender: <code>{settings.resend_from_email}</code><br>"
        f"App-URL: <code>{settings.app_base_url}</code><br>"
        f"Ausgelöst von: <code>{requested_by}</code></p>"
        f"<p>Wenn du diese Mail liest, ist der Mailversand richtig konfiguriert.</p>"
        f"<p>– Clok</p>"
    )
    return text, html


@router.post("/test-email", response_model=TestEmailOut)
def admin_test_email(
    payload: TestEmailIn,
    actor: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Schickt eine Test-Mail an die übergebene Adresse über die echte
    Resend-Pipeline. Liefert Resend-Message-ID bei Erfolg, sonst die
    strukturierte Fehlermeldung der API."""
    settings = get_settings()
    requested_by = f"{actor.username} <{actor.email}>"
    text, html = _build_test_body(settings, requested_by)
    subject = payload.subject or "Clok – Test-Mail"

    result = resend.send(to=payload.to, subject=subject, html=html, text=text)

    if not result.ok and not result.dev_mode:
        # Fehler an den Aufrufer durchreichen, aber nicht 500 – die Diagnose-
        # Antwort ist die strukturierte Detail-Info, die der Admin sehen will.
        # Wir geben 200 + success=False zurück, weil der Endpoint selbst
        # erfolgreich gelaufen ist.
        pass

    return TestEmailOut(
        dev_mode=result.dev_mode,
        success=result.ok,
        sent_to=payload.to,
        from_address=settings.resend_from_email,
        message_id=result.message_id,
        status_code=result.status_code,
        error_name=result.error_name,
        error_message=result.error_message,
    )
