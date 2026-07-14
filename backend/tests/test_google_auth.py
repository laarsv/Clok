"""Google-OAuth: Kernlogik resolve_or_create_user (Domain-Check, Verknüpfen, JIT).

Direktaufrufe der Router-Funktion (kein HTTP/Google) – analog zu test_projects.py.
"""
from types import SimpleNamespace

import pytest

from app.models import BillingMode, EmploymentTerms, FederalState, Role, User
from app.routers.google_auth import GoogleAuthError, resolve_or_create_user


def _settings(supervisor_email="boss@koenigswege.com", allowed="koenigswege.com"):
    return SimpleNamespace(
        google_allowed_domain=allowed,
        google_jit_supervisor_email=supervisor_email,
    )


def _claims(email, sub, *, verified=True, hd="koenigswege.com", name="Test Person"):
    return {"email": email, "sub": sub, "email_verified": verified, "hd": hd, "name": name}


def _boss(db):
    u = User(username="boss", email="boss@koenigswege.com", password_hash="x",
             role=Role.EMPLOYER, federal_state=FederalState.NW)
    db.add(u); db.commit(); db.refresh(u)
    return u


def test_jit_creates_employee_under_supervisor(db_session):
    boss = _boss(db_session)
    user = resolve_or_create_user(
        db_session, _claims("max.mustermann@koenigswege.com", "g-max", name="Max Mustermann"),
        _settings())
    assert user.role == Role.EMPLOYEE
    assert user.supervisor_id == boss.id
    assert user.google_sub == "g-max"
    assert user.is_active is True
    assert user.password_hash is None
    assert user.billing_mode == BillingMode.HOURLY
    assert user.federal_state == FederalState.NW  # vom Supervisor geerbt
    assert user.full_name == "Max Mustermann"
    # Initialer Vertrag wurde angelegt
    assert db_session.query(EmploymentTerms).filter_by(user_id=user.id).first() is not None


def test_existing_user_linked_by_email(db_session):
    _boss(db_session)
    anna = User(username="anna", email="anna@koenigswege.com", password_hash="x",
                role=Role.EMPLOYEE)
    db_session.add(anna); db_session.commit()
    user = resolve_or_create_user(db_session, _claims("anna@koenigswege.com", "g-anna"), _settings())
    assert user.id == anna.id
    assert user.google_sub == "g-anna"       # verknüpft
    # kein neuer Nutzer
    assert db_session.query(User).filter_by(email="anna@koenigswege.com").count() == 1


def test_second_login_matches_by_sub(db_session):
    _boss(db_session)
    first = resolve_or_create_user(db_session, _claims("t@koenigswege.com", "g-1"), _settings())
    db_session.commit()
    # gleiche sub, aber (theoretisch) andere Mail → selber Nutzer über google_sub
    again = resolve_or_create_user(db_session, _claims("t@koenigswege.com", "g-1"), _settings())
    assert again.id == first.id
    assert db_session.query(User).filter(User.role == Role.EMPLOYEE).count() == 1


def test_wrong_domain_rejected(db_session):
    _boss(db_session)
    with pytest.raises(GoogleAuthError) as e:
        resolve_or_create_user(db_session, _claims("someone@gmail.com", "g-x", hd=""), _settings())
    assert e.value.code == "wrong_domain"


def test_unverified_email_rejected(db_session):
    _boss(db_session)
    with pytest.raises(GoogleAuthError) as e:
        resolve_or_create_user(
            db_session, _claims("max@koenigswege.com", "g-x", verified=False), _settings())
    assert e.value.code == "email_unverified"


def test_no_supervisor_configured_rejects_new_user(db_session):
    # Kein JIT-Supervisor → unbekannte Nutzer werden abgewiesen (keine Waisen)
    with pytest.raises(GoogleAuthError) as e:
        resolve_or_create_user(
            db_session, _claims("neu@koenigswege.com", "g-neu"), _settings(supervisor_email=""))
    assert e.value.code == "no_account"
    assert db_session.query(User).count() == 0
