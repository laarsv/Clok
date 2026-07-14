"""Google-OAuth: Kernlogik resolve_or_create_user (Domain-Check, Verknüpfen, JIT).

Direktaufrufe der Router-Funktion (kein HTTP/Google) – analog zu test_projects.py.
"""
from types import SimpleNamespace

import pytest

from app.models import (BillingMode, EmploymentTerms, FederalState,
                        OnboardingStatus, Role, User)
from app.routers.google_auth import GoogleAuthError, resolve_or_create_user


def _settings(role="employee", supervisor_email="boss@koenigswege.com", allowed="koenigswege.com"):
    return SimpleNamespace(
        google_allowed_domain=allowed,
        google_jit_role=role,
        google_jit_supervisor_email=supervisor_email,
    )


def _claims(email, sub, *, verified=True, hd="koenigswege.com", name="Test Person"):
    return {"email": email, "sub": sub, "email_verified": verified, "hd": hd, "name": name}


def _boss(db):
    u = User(username="boss", email="boss@koenigswege.com", password_hash="x",
             role=Role.EMPLOYER, federal_state=FederalState.NW)
    db.add(u); db.commit(); db.refresh(u)
    return u


def test_jit_creates_employer(db_session):
    user = resolve_or_create_user(
        db_session, _claims("chef@koenigswege.com", "g-chef", name="Chef Person"),
        _settings(role="employer"))
    assert user.role == Role.EMPLOYER
    assert user.supervisor_id is None
    assert user.google_sub == "g-chef"
    assert user.is_active is True
    assert user.password_hash is None
    assert user.onboarding_status == OnboardingStatus.ACTIVE  # kein Invite-Wizard
    # Arbeitgeber bekommen keinen Vertrag
    assert db_session.query(EmploymentTerms).filter_by(user_id=user.id).first() is None


def test_jit_creates_employee_under_supervisor(db_session):
    boss = _boss(db_session)
    user = resolve_or_create_user(
        db_session, _claims("max.mustermann@koenigswege.com", "g-max", name="Max Mustermann"),
        _settings(role="employee"))
    assert user.role == Role.EMPLOYEE
    assert user.supervisor_id == boss.id
    assert user.billing_mode == BillingMode.HOURLY
    assert user.federal_state == FederalState.NW  # vom Supervisor geerbt
    assert db_session.query(EmploymentTerms).filter_by(user_id=user.id).first() is not None


def test_existing_user_linked_by_email(db_session):
    anna = User(username="anna", email="anna@koenigswege.com", password_hash="x",
                role=Role.EMPLOYEE)
    db_session.add(anna); db_session.commit()
    user = resolve_or_create_user(db_session, _claims("anna@koenigswege.com", "g-anna"),
                                  _settings(role="employer"))
    assert user.id == anna.id
    assert user.google_sub == "g-anna"       # verknüpft, Rolle unverändert
    assert user.role == Role.EMPLOYEE
    assert db_session.query(User).filter_by(email="anna@koenigswege.com").count() == 1


def test_second_login_matches_by_sub(db_session):
    first = resolve_or_create_user(db_session, _claims("t@koenigswege.com", "g-1"),
                                   _settings(role="employer"))
    db_session.commit()
    again = resolve_or_create_user(db_session, _claims("t@koenigswege.com", "g-1"),
                                   _settings(role="employer"))
    assert again.id == first.id
    assert db_session.query(User).filter(User.role == Role.EMPLOYER).count() == 1


def test_wrong_domain_rejected(db_session):
    with pytest.raises(GoogleAuthError) as e:
        resolve_or_create_user(db_session, _claims("someone@gmail.com", "g-x", hd=""),
                               _settings(role="employer"))
    assert e.value.code == "wrong_domain"


def test_unverified_email_rejected(db_session):
    with pytest.raises(GoogleAuthError) as e:
        resolve_or_create_user(
            db_session, _claims("max@koenigswege.com", "g-x", verified=False),
            _settings(role="employer"))
    assert e.value.code == "email_unverified"


def test_jit_off_rejects_new_user(db_session):
    # google_jit_role="" ⇒ keine Auto-Anlage, unbekannte Nutzer abgewiesen
    with pytest.raises(GoogleAuthError) as e:
        resolve_or_create_user(db_session, _claims("neu@koenigswege.com", "g-neu"),
                               _settings(role=""))
    assert e.value.code == "no_account"
    assert db_session.query(User).count() == 0


def test_employee_role_without_supervisor_is_misconfig(db_session):
    with pytest.raises(GoogleAuthError) as e:
        resolve_or_create_user(db_session, _claims("neu@koenigswege.com", "g-neu"),
                               _settings(role="employee", supervisor_email=""))
    assert e.value.code == "jit_misconfigured"
