"""Lohnfortzahlungs-Stunden (Urlaub/Krankheit zählen wie gearbeitet).

Sichert die neue Anzeige-Logik: hours_for_absence / paid_absence_credit_hours,
und dass der Saldo dadurch NICHT verändert wird (Urlaub == gearbeitet).
"""
from datetime import date, datetime

from app.balance import hours_for_absence, paid_absence_credit_hours, saldo_for_user
from app.models import (Absence, AbsenceStatus, AbsenceType, BillingMode,
                        FederalState, Role, TimeEntry, User)
from app.terms import create_initial_terms


def _user(db, username="anna"):
    u = User(username=username, email=f"{username}@x.de", password_hash="x", role=Role.EMPLOYEE,
             billing_mode=BillingMode.SALARY, weekly_hours=10.0,
             work_days=["mon", "tue", "wed", "thu", "fri"], federal_state=FederalState.NW,
             hire_date=date(2026, 4, 1))
    db.add(u); db.commit(); db.refresh(u)
    create_initial_terms(db, u, valid_from=u.hire_date); db.commit()
    return u


def _abs(uid, typ, s, e, status=AbsenceStatus.APPROVED):
    return Absence(user_id=uid, type=typ, start_date=s, end_date=e, status=status)


def test_paid_absence_credits_daily_target(db_session):
    u = _user(db_session)
    a = _abs(u.id, AbsenceType.VACATION, date(2026, 6, 29), date(2026, 7, 1))  # Mo-Mi = 3 Werktage
    db_session.add(a); db_session.commit()
    assert hours_for_absence(db_session, u, a) == 6.0  # 3 × (10h/5) = 6h


def test_hours_for_absence_clipped_to_window(db_session):
    u = _user(db_session)
    a = _abs(u.id, AbsenceType.VACATION, date(2026, 6, 29), date(2026, 7, 1))  # Mo/Di/Mi
    db_session.add(a); db_session.commit()
    assert hours_for_absence(db_session, u, a) == 6.0  # gesamt: 3 × 2h
    # nur Juli-Fenster → nur 01.07. = 2h; nur Juni → 29.+30.06. = 4h
    assert hours_for_absence(db_session, u, a, date(2026, 7, 1), date(2026, 7, 31)) == 2.0
    assert hours_for_absence(db_session, u, a, date(2026, 6, 1), date(2026, 6, 30)) == 4.0


def test_unpaid_absence_credits_zero(db_session):
    u = _user(db_session)
    a = _abs(u.id, AbsenceType.UNPAID, date(2026, 6, 29), date(2026, 7, 1))
    db_session.add(a); db_session.commit()
    assert hours_for_absence(db_session, u, a) == 0.0


def test_pending_absence_credits_zero(db_session):
    u = _user(db_session)
    a = _abs(u.id, AbsenceType.VACATION, date(2026, 6, 29), date(2026, 7, 1),
             status=AbsenceStatus.PENDING)
    db_session.add(a); db_session.commit()
    assert hours_for_absence(db_session, u, a) == 0.0


def test_period_credit_sums_paid_only(db_session):
    u = _user(db_session)
    db_session.add(_abs(u.id, AbsenceType.VACATION, date(2026, 6, 29), date(2026, 6, 30)))  # 4h
    db_session.add(_abs(u.id, AbsenceType.UNPAID, date(2026, 7, 1), date(2026, 7, 1)))       # 0
    db_session.commit()
    assert paid_absence_credit_hours(db_session, u, date(2026, 4, 1), date(2026, 7, 13)) == 4.0


def test_saldo_unchanged_urlaub_gleich_gearbeitet(db_session):
    """Regressionsschutz: genehmigter Urlaub ergibt denselben Saldo wie die
    Tage regulär zu arbeiten – die neue Gutschrift-Anzeige ändert nichts."""
    u = _user(db_session, "anna")
    db_session.add(_abs(u.id, AbsenceType.VACATION, date(2026, 6, 29), date(2026, 7, 1)))
    db_session.commit()
    s_vac = saldo_for_user(db_session, u, date(2026, 7, 13))

    w = _user(db_session, "tom")
    for d in (date(2026, 6, 29), date(2026, 6, 30), date(2026, 7, 1)):
        db_session.add(TimeEntry(user_id=w.id, start_at=datetime(d.year, d.month, d.day, 9, 0),
                                 end_at=datetime(d.year, d.month, d.day, 11, 0), break_minutes=0))
    db_session.commit()
    s_worked = saldo_for_user(db_session, w, date(2026, 7, 13))

    assert abs(s_vac - s_worked) < 0.01


def test_sick_capped_at_6_weeks(db_session):
    """Entgeltfortzahlung bei Krankheit endet nach 42 Kalendertagen: eine über
    das Fenster hinaus verlängerte Krankheit schreibt keine Mehr-Stunden gut."""
    u = _user(db_session)
    a = _abs(u.id, AbsenceType.SICK, date(2026, 4, 1), date(2026, 5, 12))  # exakt 42 Kalendertage
    db_session.add(a); db_session.commit()
    h42 = hours_for_absence(db_session, u, a)
    assert h42 > 0
    a.end_date = date(2026, 6, 30)   # auf ~90 Tage verlängern
    db_session.commit()
    assert hours_for_absence(db_session, u, a) == h42  # Deckel: ab Tag 43 keine Gutschrift


def test_continuous_sick_periods_merge(db_session):
    """Angrenzende Krank-Abwesenheiten bilden EINE Periode (Frist zählt ab dem
    frühesten Start); eine Lücke bricht sie und startet eine neue Frist."""
    from app.balance import _continuous_sick_start
    u = _user(db_session)
    a1 = _abs(u.id, AbsenceType.SICK, date(2026, 4, 1), date(2026, 4, 30))
    a2 = _abs(u.id, AbsenceType.SICK, date(2026, 5, 1), date(2026, 5, 20))  # grenzt an a1
    a3 = _abs(u.id, AbsenceType.SICK, date(2026, 7, 1), date(2026, 7, 10))  # Lücke → eigene Periode
    db_session.add_all([a1, a2, a3]); db_session.commit()
    assert _continuous_sick_start(db_session, u, a2) == date(2026, 4, 1)
    assert _continuous_sick_start(db_session, u, a3) == date(2026, 7, 1)
