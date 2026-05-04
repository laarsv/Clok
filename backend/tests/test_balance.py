from datetime import date, datetime, timedelta

from app.balance import saldo_for_user
from app.models import BillingMode, FederalState, Role, TimeEntry, User


def _make_user(db, **kwargs):
    defaults = dict(
        username="lars",
        email="lars@example.com",
        password_hash="x",
        role=Role.EMPLOYEE,
        billing_mode=BillingMode.SALARY,
        monthly_target_hours=168.0,
        federal_state=FederalState.BW,
        hire_date=date(2026, 1, 1),
    )
    defaults.update(kwargs)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_hourly_user_hat_saldo_null(db_session):
    user = _make_user(db_session, billing_mode=BillingMode.HOURLY)
    assert saldo_for_user(db_session, user, date(2026, 5, 1)) == 0.0


def test_initialer_uebertrag_ohne_eintraege(db_session):
    user = _make_user(
        db_session,
        initial_overtime_hours=12.5,
        hire_date=None,  # ohne hire_date kein Soll-Abzug
    )
    assert saldo_for_user(db_session, user, date(2026, 5, 1)) == 12.5


def test_arbeitsstunden_erhoehen_saldo(db_session):
    user = _make_user(db_session, hire_date=None, monthly_target_hours=0)
    # 1 Eintrag mit 8h netto am 02.01.2026
    db_session.add(TimeEntry(
        user_id=user.id,
        start_at=datetime(2026, 1, 2, 9, 0),
        end_at=datetime(2026, 1, 2, 17, 30),
        break_minutes=30,
    ))
    db_session.commit()
    assert saldo_for_user(db_session, user, date(2026, 1, 31)) == 8.0
