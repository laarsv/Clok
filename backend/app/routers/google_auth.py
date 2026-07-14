"""Login via Google (OIDC Authorization-Code-Flow), beschränkt auf eine
Workspace-Domain.

Ablauf:
  GET /api/auth/google/login     → Redirect zu Google (mit State-Cookie).
  GET /api/auth/google/callback  → Code→Token tauschen, Claims prüfen,
                                    Clok-Nutzer finden/anlegen, JWT ausstellen,
                                    zurück ins SPA (`/auth/google#token=…`).

Neu auftauchende Nutzer der erlaubten Domain werden – wenn ein JIT-Supervisor
konfiguriert ist – als Mitarbeiter dieses Arbeitgebers angelegt (Rolle employee,
Login nur via Google). Ohne konfigurierten Supervisor werden unbekannte Nutzer
abgewiesen (keine verwaisten Konten).
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import date
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import get_settings
from app.database import get_db
from app.models import BillingMode, Role, User
from app.terms import create_initial_terms

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/google", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_STATE_COOKIE = "g_oauth_state"
_COOKIE_PATH = "/api/auth/google"


class GoogleAuthError(Exception):
    """Fachliche Ablehnung im Google-Flow; `code` wird ans Frontend gereicht."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _frontend_redirect(fragment: str) -> RedirectResponse:
    # Token/Fehler im URL-Fragment (#…): landet nicht in Server-Logs oder Referer.
    base = get_settings().app_base_url.rstrip("/")
    return RedirectResponse(url=f"{base}/auth/google#{fragment}", status_code=302)


@router.get("/login")
def google_login():
    settings = get_settings()
    if not settings.google_oauth_enabled:
        raise HTTPException(status_code=404, detail="Google-Login ist nicht aktiviert.")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "hd": settings.google_allowed_domain,  # nur UI-Hinweis, KEINE Sicherheitsgrenze
        "access_type": "online",
    }
    resp = RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)
    resp.set_cookie(_STATE_COOKIE, state, max_age=600, httponly=True,
                    secure=True, samesite="lax", path=_COOKIE_PATH)
    return resp


def _exchange_code(code: str, settings) -> dict:
    """Tauscht den Auth-Code gegen Tokens und liefert die ID-Token-Claims.
    Das ID-Token kommt direkt vom Google-Token-Endpoint über TLS (Server-zu-
    Server), daher genügt das Auslesen der Claims ohne separate Signaturprüfung;
    aud/iss/exp werden dennoch geprüft."""
    r = httpx.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }, timeout=10.0)
    if r.status_code >= 300:
        log.error("Google token exchange %d: %s", r.status_code, r.text)
        raise GoogleAuthError("exchange_failed", "Token-Austausch mit Google fehlgeschlagen.")
    id_token = r.json().get("id_token")
    if not id_token:
        raise GoogleAuthError("no_id_token", "Google lieferte kein ID-Token.")
    claims = jwt.get_unverified_claims(id_token)
    if claims.get("aud") != settings.google_client_id:
        raise GoogleAuthError("bad_aud", "ID-Token für falschen Client.")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise GoogleAuthError("bad_iss", "ID-Token von unerwartetem Aussteller.")
    if not claims.get("exp") or int(claims["exp"]) < int(time.time()):
        raise GoogleAuthError("expired", "ID-Token abgelaufen.")
    return claims


def _unique_username(db: Session, base: str) -> str:
    base = (base or "").strip().lower() or "user"
    candidate, i = base, 1
    while db.query(User).filter(User.username == candidate).first() is not None:
        i += 1
        candidate = f"{base}{i}"
    return candidate


def resolve_or_create_user(db: Session, claims: dict, settings) -> User:
    """Kern-Logik (testbar): Domain prüfen, Clok-Nutzer über google_sub oder
    E-Mail finden, sonst per JIT anlegen. Wirft GoogleAuthError bei Ablehnung.
    Flusht, committet aber NICHT (macht der Aufrufer)."""
    email = (claims.get("email") or "").strip().lower()
    sub = claims.get("sub")
    hd = (claims.get("hd") or "").strip().lower()
    allowed = settings.google_allowed_domain.strip().lower()
    if not email or not sub:
        raise GoogleAuthError("incomplete", "Google-Profil unvollständig.")
    if not claims.get("email_verified"):
        raise GoogleAuthError("email_unverified", "Google-E-Mail ist nicht verifiziert.")
    email_domain = email.rsplit("@", 1)[-1]
    if allowed and hd != allowed and email_domain != allowed:
        raise GoogleAuthError(
            "wrong_domain",
            f"Nur Konten der Domain {allowed} dürfen sich per Google anmelden.")

    # 1) stabile google_sub
    user = db.query(User).filter(User.google_sub == sub).first()
    if user is not None:
        return user
    # 2) bestehendes Konto per E-Mail verknüpfen
    user = db.query(User).filter(User.email == email).first()
    if user is not None:
        user.google_sub = sub
        if not user.is_active:
            user.is_active = True  # Google-verifiziert ⇒ Konto freischalten
        db.flush()
        return user
    # 3) JIT: neuen Mitarbeiter anlegen (nur mit konfiguriertem Supervisor)
    sup_email = settings.google_jit_supervisor_email.strip().lower()
    if not sup_email:
        raise GoogleAuthError("no_account", "Für diese Adresse existiert noch kein Clok-Konto.")
    supervisor = (
        db.query(User)
        .filter(User.email == sup_email, User.role == Role.EMPLOYER)
        .first()
    )
    if supervisor is None:
        log.error("GOOGLE_JIT_SUPERVISOR_EMAIL=%s ist kein Arbeitgeber-Konto", sup_email)
        raise GoogleAuthError("jit_misconfigured", "Automatische Kontoanlage ist nicht korrekt konfiguriert.")

    user = User(
        username=_unique_username(db, email.split("@", 1)[0]),
        email=email,
        full_name=claims.get("name") or email.split("@", 1)[0],
        role=Role.EMPLOYEE,
        supervisor_id=supervisor.id,
        google_sub=sub,
        is_active=True,
        password_hash=None,
        billing_mode=BillingMode.HOURLY,  # sicherer Default; AG verfeinert in der UI
        work_days=["mon", "tue", "wed", "thu", "fri"],
        federal_state=supervisor.federal_state,
        hire_date=date.today(),
    )
    db.add(user)
    db.flush()
    create_initial_terms(db, user, valid_from=user.hire_date, creator_id=supervisor.id)
    log.info("JIT-Google-Nutzer angelegt: %s (supervisor_id=%s)", email, supervisor.id)
    return user


@router.get("/callback")
def google_callback(
    request: Request,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if not settings.google_oauth_enabled:
        raise HTTPException(status_code=404, detail="Google-Login ist nicht aktiviert.")
    if error:
        return _frontend_redirect(f"error={error}")
    cookie_state = request.cookies.get(_STATE_COOKIE)
    if not code or not state or not cookie_state or state != cookie_state:
        return _frontend_redirect("error=bad_state")
    try:
        claims = _exchange_code(code, settings)
        user = resolve_or_create_user(db, claims, settings)
        db.commit()
    except GoogleAuthError as e:
        db.rollback()
        return _frontend_redirect(f"error={e.code}")
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("Google-Callback: unerwarteter Fehler")
        return _frontend_redirect("error=server")

    token = create_access_token(user.username)
    resp = _frontend_redirect(f"token={token}")
    resp.delete_cookie(_STATE_COOKIE, path=_COOKIE_PATH)
    return resp
