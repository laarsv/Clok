"""Saldo-Berechnung (Über-/Minusstunden) und Monats-Soll.

Nur für Salary-Modell relevant. Bei Hourly wird stattdessen der
abrechenbare Betrag aus den Netto-Stunden gebildet (siehe stats.py).

Saldo = initial_overtime
        + Σ(net_hours bis Stichtag, abzüglich Pausen)
        - Σ(target_hours pro abgeschlossenem Monat ab hire_date,
            jeweils anteilig reduziert um Urlaubs-/Kranktage in dem Monat)

Pausenabzug steckt schon in net_hours. Urlaubsabzug arbeitet über die
Werktag-Logik in absences.working_days_in_range.
"""
from datetime import date, datetime, timedelta
from typing import Iterable

from sqlalchemy.orm import Session

from app.absences import working_days_in_range
from app.models import (
    Absence, AbsenceStatus, AbsenceType, BillingMode, TimeEntry, User,
)
from app.terms import terms_at


def _net_hours(entry: TimeEntry) -> float:
    if entry.end_at is None:
        return 0.0
    gross = (entry.end_at - entry.start_at).total_seconds() / 3600.0
    return max(0.0, gross - entry.break_minutes / 60.0)


def _months_in_range(start: date, end: date) -> Iterable[tuple[date, date]]:
    """Liefert (monat_start, monat_ende_exklusiv) für jeden Monat im Bereich."""
    cur = date(start.year, start.month, 1)
    while cur < end:
        if cur.month == 12:
            nxt = date(cur.year + 1, 1, 1)
        else:
            nxt = date(cur.year, cur.month + 1, 1)
        yield cur, nxt
        cur = nxt


def saldo_for_user(db: Session, user: User, until: date) -> float:
    """Saldo (Über-/Minusstunden) bis einschließlich `until`. Nur Salary.

    Soll-Stunden werden monatlich anhand des zum Monatsbeginn gültigen
    Vertrags ermittelt – damit verändert ein neuer Vertrag mit
    valid_from in der Zukunft den historischen Saldo nicht.
    """
    if user.billing_mode != BillingMode.SALARY:
        return 0.0

    saldo = user.initial_overtime_hours or 0.0

    # Ist-Stunden bis Stichtag
    until_dt = datetime.combine(until + timedelta(days=1), datetime.min.time())
    rows = (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == user.id, TimeEntry.start_at < until_dt)
        .all()
    )
    saldo += sum(_net_hours(e) for e in rows)

    if user.hire_date is None:
        return round(saldo, 2)

    for m_start, m_end in _months_in_range(user.hire_date, until + timedelta(days=1)):
        eff_end = min(m_end, until + timedelta(days=1))
        eff_start = max(m_start, user.hire_date)

        # Vertrag, der für diesen Monat gilt (Stichtag = Monatsstart oder
        # eff_start, falls Eintrittsmonat).
        terms = terms_at(db, user, eff_start)
        target = (terms.monthly_target_hours if terms
                  else user.monthly_target_hours) or 0.0
        if target == 0.0 or terms is None or terms.billing_mode != BillingMode.SALARY:
            continue
        target_per_workday = target / 21.0

        workdays = working_days_in_range(
            db, user, eff_start, eff_end - timedelta(days=1),
            include_absences=False,
        )
        absent_days = (
            db.query(Absence)
            .filter(
                Absence.user_id == user.id,
                Absence.status == AbsenceStatus.APPROVED,
                Absence.type.in_((AbsenceType.VACATION, AbsenceType.SICK)),
                Absence.start_date < eff_end,
                Absence.end_date >= eff_start,
            )
            .all()
        )
        absent_workdays = 0
        for a in absent_days:
            absent_workdays += working_days_in_range(
                db, user, max(a.start_date, eff_start),
                min(a.end_date, eff_end - timedelta(days=1)),
                include_absences=False,
            )
        saldo -= max(0.0, (workdays - absent_workdays) * target_per_workday)

    return round(saldo, 2)
