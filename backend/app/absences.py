"""Geschäftslogik rund um Abwesenheiten: Resturlaub, Werktage."""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.holidays_de import is_holiday
from app.models import Absence, AbsenceStatus, AbsenceType, User
from app.work_days import is_work_day


def _work_days_for(db: Session, user: User, d: date) -> list[str]:
    """Lokaler Wrapper, vermeidet Circular Import mit terms.py."""
    from app.terms import work_days_at
    return work_days_at(db, user, d)


def _annual_vacation_for(db: Session, user: User, d: date) -> float:
    from app.terms import field_at
    return float(field_at(db, user, d, "annual_vacation_days") or 0.0)


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
        wd = _work_days_for(db, user, cur)
        if (
            is_work_day(wd, cur)
            and not is_holiday(cur, state)
            and cur not in absent_dates
        ):
            count += 1
        cur += timedelta(days=1)
    return count


def remaining_vacation_days(db: Session, user: User, year: int) -> float:
    """Resturlaub für ein Kalenderjahr.

    Berechnet als annual_vacation_days + ggf. initial_remaining_vacation
    (nur im Eintrittsjahr) abzüglich Werktage in approved+pending
    Urlaubsanträgen des Jahres.
    """
    year_end = date(year, 12, 31)
    anspruch = _annual_vacation_for(db, user, year_end)
    if user.hire_date and user.hire_date.year == year:
        anspruch += float(user.initial_remaining_vacation or 0.0)

    year_start = date(year, 1, 1)

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
            wd = _work_days_for(db, user, cur)
            if is_work_day(wd, cur) and not is_holiday(cur, state):
                used += 1
            cur += timedelta(days=1)

    return round(anspruch - used, 2)
