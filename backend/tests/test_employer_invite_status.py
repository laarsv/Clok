"""Status-Ableitung aus Timestamps am EmployerInvite-Modell.

Der Status wird nicht persistiert, sondern zur Anzeige aus den
Lifecycle-Timestamps (revoked_at / accepted_at / expires_at) abgeleitet.
Diese Tests fixieren die Reihenfolge und Trumpf-Logik:
- revoked schlägt accepted/expired
- accepted schlägt expired
"""
from datetime import datetime, timedelta

from app.models import EmployerInvite
from app.routers.admin_invites import _derive_status


def _new_invite(**overrides) -> EmployerInvite:
    base = dict(
        id=1,
        email="x@example.com",
        token_hash="a" * 64,
        expires_at=datetime.utcnow() + timedelta(days=7),
        created_at=datetime.utcnow(),
    )
    base.update(overrides)
    return EmployerInvite(**base)


def test_pending_wenn_kein_lifecycle_timestamp_gesetzt():
    inv = _new_invite()
    assert _derive_status(inv) == "pending"


def test_expired_bei_abgelaufenem_token():
    inv = _new_invite(expires_at=datetime.utcnow() - timedelta(hours=1))
    assert _derive_status(inv) == "expired"


def test_accepted_schlaegt_expired():
    """Ein eingelöster Invite, dessen Frist später abläuft, bleibt
    'accepted' – Lebenszyklus ist abgeschlossen."""
    inv = _new_invite(
        accepted_at=datetime.utcnow() - timedelta(days=1),
        expires_at=datetime.utcnow() - timedelta(hours=1),
    )
    assert _derive_status(inv) == "accepted"


def test_revoked_schlaegt_accepted_und_expired():
    """Wenn ein Admin nach dem Ablauf 'zurückzieht', soll der Status
    'revoked' den Vorrang behalten – das ist die explizitere Aktion."""
    inv = _new_invite(
        revoked_at=datetime.utcnow(),
        accepted_at=datetime.utcnow() - timedelta(days=1),
        expires_at=datetime.utcnow() - timedelta(hours=1),
    )
    assert _derive_status(inv) == "revoked"
