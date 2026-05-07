"""Saldo per beliebigem Stichtag.

Reproduziert den Bug aus dem UX-Refactor: für einen User mit
hire_date Anfang Jahr, der bis Mai nur wenige Stunden getrackt hat,
darf der Saldo am 31.12. nicht als „aktueller Saldo" gelesen werden –
die Funktion saldo_for_user rechnet aber für jeden Stichtag korrekt,
solange man den richtigen Stichtag mitgibt.

Diese Tests fixieren das erwartete Verhalten:
- saldo bis 31.12. = (Ist bis 31.12.) − (Soll Jan–Dez) → tief negativ
- saldo bis 7.5.  = (Ist bis 7.5.)  − (Soll Jan–7.5.) → realistisch klein
"""
from datetime import date, datetime

from app.balance import saldo_for_user
from app.models import BillingMode, FederalState, Role, TimeEntry, User


def _make_salary_user(db) -> User:
    user = User(
        username="lars",
        email="lars@example.com",
        password_hash="x",
        role=Role.EMPLOYEE,
        billing_mode=BillingMode.SALARY,
        weekly_hours=40.0,
        work_days=["mon", "tue", "wed", "thu", "fri"],
        federal_state=FederalState.NW,
        hire_date=date(2026, 1, 1),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _add_entries(db, user_id: int, days_with_8h: list[date]):
    for d in days_with_8h:
        db.add(TimeEntry(
            user_id=user_id,
            start_at=datetime(d.year, d.month, d.day, 9, 0),
            end_at=datetime(d.year, d.month, d.day, 17, 30),
            break_minutes=30,
        ))
    db.commit()


def test_saldo_per_heute_realistisch_bei_wenigen_tracked_stunden(db_session):
    user = _make_salary_user(db_session)
    # Zwei Tage Anfang Mai mit je 8h getrackt
    _add_entries(db_session, user.id, [date(2026, 5, 4), date(2026, 5, 5)])

    saldo_per_heute = saldo_for_user(db_session, user, date(2026, 5, 7))

    # Erwartet: stark negativ, aber NICHT ein ganzes Jahres-Soll.
    # Ein 40h/Woche-User hat von 1.1. bis 7.5. ~89 Werktage, abzüglich
    # NW-Feiertage ~85. Das wären ~680h Soll. 16h Ist => Saldo ~-664h.
    # Wichtig für den Bug-Fix: deutlich besser als die alte UI-Anzeige
    # von ca. -1344h (volles Jahres-Soll).
    assert saldo_per_heute > -800, (
        f"Saldo per heute sollte realistisch sein (~-650h), war {saldo_per_heute}. "
        "Der Bug zeigt sich, wenn das Backend Soll fürs ganze Jahr rechnet."
    )
    assert saldo_per_heute < -500


def test_saldo_jahresende_ist_strikt_negativer_als_per_heute(db_session):
    user = _make_salary_user(db_session)
    _add_entries(db_session, user.id, [date(2026, 5, 4), date(2026, 5, 5)])

    saldo_per_heute = saldo_for_user(db_session, user, date(2026, 5, 7))
    saldo_jahresende = saldo_for_user(db_session, user, date(2026, 12, 31))

    # Bis Jahresende ohne weiteres Tracken: das volle restliche Soll
    # frisst weiter ins Negative. Genau das ist die irreführende UI-
    # Zahl. Wir fixieren hier die Reihenfolge, damit ein FE-Refactor,
    # der versehentlich wieder "balance_at_year_end" benutzt, das
    # Verhalten nicht still ändert.
    assert saldo_jahresende < saldo_per_heute - 500
