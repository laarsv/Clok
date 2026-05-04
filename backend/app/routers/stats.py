"""Aggregations: day/week/month totals depending on billing mode + year overview."""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.absences import remaining_vacation_days
from app.auth import get_current_user
from app.balance import saldo_for_user, target_hours_for_period
from app.database import get_db
from app.models import (
    Absence, AbsenceStatus, AbsenceType, BillingMode, TimeEntry, User,
)
from app.permissions import visible_user_ids
from app.schemas import MonthSummary, PeriodSummary, YearOverview

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _net(entries: list[TimeEntry]) -> float:
    total = 0.0
    for e in entries:
        if e.end_at is None:
            continue
        total += max(0.0, (e.end_at - e.start_at).total_seconds() / 3600
                     - e.break_minutes / 60)
    return total


def _summary(db: Session, user: User, period: str, start: datetime, end: datetime,
             entries: list[TimeEntry]) -> PeriodSummary:
    net = _net(entries)
    target = None
    remaining = None
    billable = None

    if user.billing_mode == BillingMode.SALARY and period == "month":
        target = target_hours_for_period(
            db, user, start.date(), (end - timedelta(days=1)).date(),
        )
        remaining = round(target - net, 2)

    if user.billing_mode == BillingMode.HOURLY:
        billable = round(net * user.hourly_rate_eur, 2)

    return PeriodSummary(
        period=period,
        start=start,
        end=end,
        net_hours=round(net, 2),
        target_hours=target,
        remaining_hours=remaining,
        billable_eur=billable,
    )


@router.get("/summary", response_model=list[PeriodSummary])
def summary(
    reference: datetime = Query(default_factory=datetime.utcnow),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liefert Tag/Woche/Monat-Summen rund um das Referenzdatum."""
    day_start = datetime.combine(reference.date(), time.min)
    day_end = day_start + timedelta(days=1)
    week_start = day_start - timedelta(days=day_start.weekday())
    week_end = week_start + timedelta(days=7)
    month_start = day_start.replace(day=1)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)

    def fetch(s, e):
        return db.query(TimeEntry).filter(
            TimeEntry.user_id == user.id,
            TimeEntry.start_at >= s,
            TimeEntry.start_at < e,
        ).all()

    return [
        _summary(db, user, "day", day_start, day_end, fetch(day_start, day_end)),
        _summary(db, user, "week", week_start, week_end, fetch(week_start, week_end)),
        _summary(db, user, "month", month_start, month_end, fetch(month_start, month_end)),
    ]


def _absence_days_in_range(
    db: Session, user_id: int, types: tuple, start: date, end_inclusive: date,
) -> int:
    rows = db.query(Absence).filter(
        Absence.user_id == user_id,
        Absence.status == AbsenceStatus.APPROVED,
        Absence.type.in_(types),
        Absence.start_date <= end_inclusive,
        Absence.end_date >= start,
    ).all()
    days = 0
    for a in rows:
        cur = max(a.start_date, start)
        stop = min(a.end_date, end_inclusive)
        while cur <= stop:
            days += 1
            cur += timedelta(days=1)
    return days


@router.get("/year-overview", response_model=YearOverview)
def year_overview(
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    user_id: int | None = Query(None, description="Admin/AG: anderer MA"),
    actor: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pro Monat: Soll, Ist, Saldo am Monatsende, Urlaubs-/Krank-/sonstige
    Abwesenheits-Tage. Mitarbeiter sehen sich selbst; Arbeitgeber/Admin
    können user_id setzen, sofern in visible_user_ids."""
    target_id = user_id if user_id is not None else actor.id
    if target_id != actor.id:
        if target_id not in visible_user_ids(actor, db):
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User nicht gefunden.")

    months: list[MonthSummary] = []
    total_actual = 0.0
    total_target = 0.0
    sick_total = 0

    for m in range(1, 13):
        m_start = date(year, m, 1)
        if m == 12:
            m_end_exclusive = date(year + 1, 1, 1)
        else:
            m_end_exclusive = date(year, m + 1, 1)
        m_end_inclusive = m_end_exclusive - timedelta(days=1)

        # Ist-Stunden
        s_dt = datetime.combine(m_start, time.min)
        e_dt = datetime.combine(m_end_exclusive, time.min)
        entries = db.query(TimeEntry).filter(
            TimeEntry.user_id == target_id,
            TimeEntry.start_at >= s_dt,
            TimeEntry.start_at < e_dt,
        ).all()
        actual = _net(entries)

        # Soll-Stunden (nur Salary, sonst 0)
        if target.billing_mode == BillingMode.SALARY:
            tgt = target_hours_for_period(db, target, m_start, m_end_inclusive)
        else:
            tgt = 0.0

        balance_at_end = saldo_for_user(db, target, m_end_inclusive)

        vac = _absence_days_in_range(db, target_id,
                                     (AbsenceType.VACATION,), m_start, m_end_inclusive)
        sick = _absence_days_in_range(db, target_id,
                                      (AbsenceType.SICK,), m_start, m_end_inclusive)
        other = _absence_days_in_range(
            db, target_id,
            (AbsenceType.UNPAID, AbsenceType.SPECIAL, AbsenceType.PARENTAL, AbsenceType.TRAINING),
            m_start, m_end_inclusive,
        )

        months.append(MonthSummary(
            month=m,
            actual_hours=round(actual, 2),
            target_hours=round(tgt, 2),
            balance_at_end=round(balance_at_end, 2),
            vacation_days=vac,
            sick_days=sick,
            other_absence_days=other,
        ))
        total_actual += actual
        total_target += tgt
        sick_total += sick

    balance_at_year_start = saldo_for_user(db, target, date(year - 1, 12, 31))
    balance_at_year_end = saldo_for_user(db, target, date(year, 12, 31))
    vac_remaining = remaining_vacation_days(db, target, year)
    vac_used = sum(m.vacation_days for m in months)

    return YearOverview(
        year=year,
        months=months,
        total_actual=round(total_actual, 2),
        total_target=round(total_target, 2),
        balance_at_year_start=round(balance_at_year_start, 2),
        balance_at_year_end=round(balance_at_year_end, 2),
        vacation_used=vac_used,
        vacation_remaining=vac_remaining,
        sick_total=sick_total,
    )
