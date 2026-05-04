"""Geschäftslogik rund um Abwesenheiten: Resturlaub, Werktage."""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.holidays_de import is_holiday
from app.models import Absence, AbsenceStatus, AbsenceType, User


def working_days_in_range(
    db: Session,
    user: User,
    start: date,
    end: date,
    include_absences: bool = True,
) -> int:
    """Anzahl Werktage Mo–Fr im inklusiven Bereich, ohne BL-Feiertage.

    Wenn include_absences=False, werden Urlaub/Krankheit NICHT
    abgezogen (für Saldo-Sollzeit-Berechnung).
    """
    if end < start:
        return 0

    state = user.federal_state.value if user.federal_state else None
    absent_dates: set[date] = set()
    if include_absences:
        rows = (
            db.query(Absence)
            .filter(
                Absence.user_id == user.id,
                Absence.status == AbsenceStatus.APPROVED,
                Absence.type.in_((AbsenceType.VACATION, AbsenceType.SICK)),
                Absence.start_date <= end,
                Absence.end_date >= start,
            )
            .all()
        )
        for a in rows:
            cur = max(a.start_date, start)
            stop = min(a.end_date, end)
            while cur <= stop:
                absent_dates.add(cur)
                cur += timedelta(days=1)

    count = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5 and not is_holiday(cur, state) and cur not in absent_dates:
            count += 1
        cur += timedelta(days=1)
    return count


def remaining_vacation_days(db: Session, user: User, year: int) -> float:
    """Resturlaub für ein Kalenderjahr.

    Berechnet als annual_vacation_days + ggf. initial_remaining_vacation
    (nur im Eintrittsjahr) abzüglich Werktage in approved+pending
    Urlaubsanträgen des Jahres.
    """
    anspruch = float(user.annual_vacation_days or 0.0)
    if user.hire_date and user.hire_date.year == year:
        anspruch += float(user.initial_remaining_vacation or 0.0)

    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)

    state = user.federal_state.value if user.federal_state else None
    rows = (
        db.query(Absence)
        .filter(
            Absence.user_id == user.id,
            Absence.type == AbsenceType.VACATION,
            Absence.status.in_((AbsenceStatus.PENDING, AbsenceStatus.APPROVED)),
            Absence.start_date <= year_end,
            Absence.end_date >= year_start,
        )
        .all()
    )

    used = 0
    for a in rows:
        cur = max(a.start_date, year_start)
        stop = min(a.end_date, year_end)
        while cur <= stop:
            if cur.weekday() < 5 and not is_holiday(cur, state):
                used += 1
            cur += timedelta(days=1)

    return round(anspruch - used, 2)
