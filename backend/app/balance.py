"""Saldo-Berechnung (Über-/Minusstunden) und Monats-Soll.

Soll-Stunden werden dynamisch aus dem Vertragsverlauf ermittelt:

  Pro Tag:
    target_per_day = weekly_hours / len(work_days)
                     wenn Tag ein Arbeitstag ist UND kein BL-Feiertag
                     UND keine approved Absence

Damit:
- Feiertagsreiche Monate (z. B. Mai in BW) haben automatisch
  niedrigeres Soll als Januar.
- Vertragswechsel mid-month wird tagesgenau berücksichtigt.
- Urlaub und Krankheit reduzieren das Soll (Lohnfortzahlung – das
  Soll an diesen Tagen entfällt, der Saldo bleibt neutral).

Saldo = initial_overtime
        + Σ(net_hours bis Stichtag, abzüglich Pausen)
        - Σ(target_per_day für jeden „echten" Arbeitstag ab hire_date)
"""
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.holidays_de import is_holiday
from app.models import (
    Absence, AbsenceStatus, AbsenceType, BalanceAdjustment, BillingMode,
    EmploymentTerms, TimeEntry, User,
)
from app.work_days import is_work_day, normalize as normalize_work_days


def _net_hours(entry: TimeEntry) -> float:
    if entry.end_at is None:
        return 0.0
    gross = (entry.end_at - entry.start_at).total_seconds() / 3600.0
    return max(0.0, gross - entry.break_minutes / 60.0)


def _terms_lookup(db: Session, user: User):
    """Lädt alle Verträge eines Users einmalig und gibt eine
    Lookup-Funktion `terms_at(d) -> EmploymentTerms|None` zurück.
    Performant für Tag-für-Tag-Iterationen über lange Zeiträume."""
    rows = (
        db.query(EmploymentTerms)
        .filter(EmploymentTerms.user_id == user.id)
        .order_by(EmploymentTerms.valid_from.asc())
        .all()
    )
    def lookup(d: date):
        active = None
        for t in rows:
            if t.valid_from <= d:
                active = t
            else:
                break
        return active
    return lookup


def _approved_absent_dates(
    db: Session, user: User, start: date, end_inclusive: date,
) -> set[date]:
    """Tage, an denen approved Abwesenheit vorliegt – egal welcher Typ.
    Diese Tage entfallen aus dem Soll: bei bezahlten Typen (Vacation,
    Sick, Special, Training) wegen Lohnfortzahlung; bei unbezahlten
    Typen (Unpaid, Parental) weil der MA effektiv nicht arbeitet."""
    rows = (
        db.query(Absence)
        .filter(
            Absence.user_id == user.id,
            Absence.status == AbsenceStatus.APPROVED,
            Absence.start_date <= end_inclusive,
            Absence.end_date >= start,
        )
        .all()
    )
    out: set[date] = set()
    for a in rows:
        cur = max(a.start_date, start)
        stop = min(a.end_date, end_inclusive)
        while cur <= stop:
            out.add(cur)
            cur += timedelta(days=1)
    return out


def target_hours_for_period(
    db: Session, user: User, start: date, end_inclusive: date,
) -> float:
    """Soll-Stunden im Zeitraum (ohne Tage mit approved Urlaub/Krankheit).
    Berücksichtigt Vertragsverlauf, work_days und BL-Feiertage tagesgenau.
    Liefert 0, wenn der zum jeweiligen Tag gültige Vertrag nicht Salary ist."""
    if end_inclusive < start:
        return 0.0
    state = user.federal_state.value if user.federal_state else None
    absent = _approved_absent_dates(db, user, start, end_inclusive)
    lookup = _terms_lookup(db, user)

    total = 0.0
    cur = start
    while cur <= end_inclusive:
        if cur in absent:
            cur += timedelta(days=1)
            continue
        terms = lookup(cur)
        if terms and terms.billing_mode == BillingMode.SALARY:
            wd = normalize_work_days(terms.work_days)
            wh = terms.weekly_hours or 0
            if wd and wh > 0 and is_work_day(wd, cur) and not is_holiday(cur, state):
                total += wh / len(wd)
        cur += timedelta(days=1)
    return round(total, 2)


# Bezahlte Abwesenheiten (Lohnfortzahlung): zählen wie gearbeitete Stunden.
# Unbezahlte (Unpaid, Parental) tragen keine Stunden bei.
PAID_ABSENCE_TYPES = (
    AbsenceType.VACATION, AbsenceType.SICK, AbsenceType.SPECIAL, AbsenceType.TRAINING,
)

# Entgeltfortzahlung bei Krankheit: 6 Wochen = 42 Kalendertage pro durchgehender
# Arbeitsunfähigkeit. Danach zahlt die Krankenkasse (Krankengeld), keine
# Arbeitgeber-Lohnfortzahlung mehr → ab Tag 43 keine Stunden-Gutschrift.
SICK_LOHNFORTZAHLUNG_DAYS = 42


def _continuous_sick_start(db: Session, user: User, absence: Absence) -> date:
    """Startdatum der durchgehenden Krankheits-Periode, zu der `absence` gehört.
    Angrenzende (Lücke 0 Kalendertage) oder überlappende genehmigte Krank-
    Abwesenheiten werden zusammengefasst; ein freier Tag dazwischen bricht die
    Periode (Genesung → neue Frist)."""
    rows = (
        db.query(Absence)
        .filter(
            Absence.user_id == user.id,
            Absence.status == AbsenceStatus.APPROVED,
            Absence.type == AbsenceType.SICK,
        )
        .all()
    )
    cur_start = absence.start_date
    cur_end = absence.end_date
    changed = True
    while changed:
        changed = False
        for a in rows:
            if (a.start_date <= cur_end + timedelta(days=1)
                    and a.end_date >= cur_start - timedelta(days=1)):
                if a.start_date < cur_start:
                    cur_start = a.start_date
                    changed = True
                if a.end_date > cur_end:
                    cur_end = a.end_date
                    changed = True
    return cur_start


def hours_for_absence(
    db: Session, user: User, absence: Absence,
    start: Optional[date] = None, end: Optional[date] = None,
) -> float:
    """Gutgeschriebene Stunden (Lohnfortzahlung) für EINE genehmigte, bezahlte
    Abwesenheit: Summe der Tages-Soll-Stunden über ihre Werktage (ohne
    Feiertage/arbeitsfreie Tage). 0 bei unbezahlten Typen, nicht genehmigt,
    oder Nicht-Salary. Mit start/end wird auf dieses Fenster beschnitten
    (z. B. Monats-Anteil einer monatsübergreifenden Abwesenheit)."""
    if user.billing_mode != BillingMode.SALARY:
        return 0.0
    if absence.status != AbsenceStatus.APPROVED or absence.type not in PAID_ABSENCE_TYPES:
        return 0.0
    state = user.federal_state.value if user.federal_state else None
    lookup = _terms_lookup(db, user)
    # Bei Krankheit: erster Kalendertag OHNE Lohnfortzahlung (Tag 43 der Periode).
    sick_cutoff = None
    if absence.type == AbsenceType.SICK:
        sick_cutoff = _continuous_sick_start(db, user, absence) + timedelta(days=SICK_LOHNFORTZAHLUNG_DAYS)
    total = 0.0
    lo = max(absence.start_date, start) if start else absence.start_date
    hi = min(absence.end_date, end) if end else absence.end_date
    cur = lo
    while cur <= hi:
        if sick_cutoff is not None and cur >= sick_cutoff:
            cur += timedelta(days=1)
            continue
        terms = lookup(cur)
        if terms and terms.billing_mode == BillingMode.SALARY:
            wd = normalize_work_days(terms.work_days)
            wh = terms.weekly_hours or 0
            if wd and wh > 0 and is_work_day(wd, cur) and not is_holiday(cur, state):
                total += wh / len(wd)
        cur += timedelta(days=1)
    return round(total, 2)


def paid_absence_credit_hours(
    db: Session, user: User, start: date, end_inclusive: date,
) -> float:
    """Summe der Lohnfortzahlungs-Stunden aller genehmigten bezahlten
    Abwesenheiten im Zeitraum (Werktage × Tages-Soll), inkl. 6-Wochen-Deckel bei
    Krankheit – für die transparente Anzeige (Soll voller Monat, Urlaub/Krankheit
    als Ist-Gutschrift). Summiert `hours_for_absence` je Abwesenheit, damit die
    Krankheits-Grenze konsistent greift."""
    if end_inclusive < start or user.billing_mode != BillingMode.SALARY:
        return 0.0
    rows = (
        db.query(Absence)
        .filter(
            Absence.user_id == user.id,
            Absence.status == AbsenceStatus.APPROVED,
            Absence.type.in_(PAID_ABSENCE_TYPES),
            Absence.start_date <= end_inclusive,
            Absence.end_date >= start,
        )
        .all()
    )
    total = sum(hours_for_absence(db, user, a, start, end_inclusive) for a in rows)
    return round(total, 2)


def saldo_for_user(db: Session, user: User, until: date) -> float:
    """Saldo (Über-/Minusstunden) bis einschließlich `until`. Nur Salary."""
    if user.billing_mode != BillingMode.SALARY:
        return 0.0

    saldo = float(user.initial_overtime_hours or 0.0)

    # Ist-Stunden bis Stichtag
    until_dt = datetime.combine(until + timedelta(days=1), datetime.min.time())
    rows = (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == user.id, TimeEntry.start_at < until_dt)
        .all()
    )
    saldo += sum(_net_hours(e) for e in rows)

    # Manuelle Korrekturen mit effective_date <= until
    adj_sum = (
        db.query(BalanceAdjustment)
        .filter(
            BalanceAdjustment.user_id == user.id,
            BalanceAdjustment.effective_date <= until,
        )
        .all()
    )
    saldo += sum(a.hours for a in adj_sum)

    if user.hire_date is None:
        return round(saldo, 2)

    saldo -= target_hours_for_period(db, user, user.hire_date, until)
    return round(saldo, 2)
