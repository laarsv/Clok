"""Aggregations: day/week/month totals depending on billing mode."""
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import BillingMode, TimeEntry, User
from app.schemas import PeriodSummary

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _net(entries: list[TimeEntry]) -> float:
    total = 0.0
    for e in entries:
        if e.end_at is None:
            continue
        total += max(0.0, (e.end_at - e.start_at).total_seconds() / 3600
                     - e.break_minutes / 60)
    return total


def _summary(user: User, period: str, start: datetime, end: datetime,
             entries: list[TimeEntry]) -> PeriodSummary:
    net = _net(entries)
    target = None
    remaining = None
    billable = None

    if user.billing_mode == BillingMode.SALARY and period == "month":
        target = user.monthly_target_hours
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
        _summary(user, "day", day_start, day_end, fetch(day_start, day_end)),
        _summary(user, "week", week_start, week_end, fetch(week_start, week_end)),
        _summary(user, "month", month_start, month_end, fetch(month_start, month_end)),
    ]
