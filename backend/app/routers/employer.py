"""Aggregiertes Arbeitgeber-/Admin-Dashboard.

Eine Anfrage liefert die komplette Übersicht aller eigenen Mitarbeiter
(Name, Soll/Ist Monat, Saldo, Urlaub, Krankheit, Status, letzte
Aktivität). So muss das Frontend keine N+1-Calls machen.
"""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.absences import remaining_vacation_days
from app.permissions import require_active_user
from app.balance import saldo_for_user, target_hours_for_period
from app.database import get_db
from app.models import (
    Absence, AbsenceStatus, AbsenceType, BillingMode, Role, TimeEntry, User,
)

router = APIRouter(prefix="/api/employer", tags=["employer"])


class EmployeeRow(BaseModel):
    id: int
    full_name: str
    username: str
    target_hours_month: float
    actual_hours_month: float
    balance_hours: float
    vacation_used: float
    vacation_remaining: float
    sick_days_month: int
    sick_days_year: int
    last_activity: date | None
    offboarded_at: datetime | None


class EmployerDashboard(BaseModel):
    reference_month: str       # "YYYY-MM"
    employees: list[EmployeeRow]


def _month_window(reference: date) -> tuple[datetime, datetime]:
    start = datetime.combine(reference.replace(day=1), time.min)
    if reference.month == 12:
        end = datetime(reference.year + 1, 1, 1)
    else:
        end = datetime(reference.year, reference.month + 1, 1)
    return start, end


def _net(entries: list[TimeEntry]) -> float:
    out = 0.0
    for e in entries:
        if e.end_at is None:
            continue
        out += max(0.0, (e.end_at - e.start_at).total_seconds() / 3600
                   - e.break_minutes / 60)
    return round(out, 2)


def _sick_days(db: Session, user_id: int, start: date, end: date) -> int:
    rows = db.query(Absence).filter(
        Absence.user_id == user_id,
        Absence.type == AbsenceType.SICK,
        Absence.status == AbsenceStatus.APPROVED,
        Absence.start_date <= end,
        Absence.end_date >= start,
    ).all()
    days = 0
    for a in rows:
        cur = max(a.start_date, start)
        stop = min(a.end_date, end)
        while cur <= stop:
            days += 1
            cur += timedelta(days=1)
    return days


@router.get("/dashboard", response_model=EmployerDashboard)
def dashboard(
    reference: date = Query(default_factory=date.today),
    actor: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if actor.role == Role.EMPLOYEE:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Kein Zugriff.")

    q = db.query(User).filter(User.role == Role.EMPLOYEE)
    if actor.role == Role.EMPLOYER:
        q = q.filter(User.supervisor_id == actor.id)
    employees = q.order_by(User.full_name).all()

    m_start, m_end = _month_window(reference)
    rows: list[EmployeeRow] = []
    for emp in employees:
        entries = db.query(TimeEntry).filter(
            TimeEntry.user_id == emp.id,
            TimeEntry.start_at >= m_start,
            TimeEntry.start_at < m_end,
        ).all()
        actual = _net(entries)
        # Soll wird dynamisch aus weekly_hours + work_days + BL-Feiertagen
        # ermittelt; berücksichtigt Vertragsverlauf tagesgenau.
        if emp.billing_mode == BillingMode.SALARY:
            target = target_hours_for_period(
                db, emp, m_start.date(), m_end.date() - timedelta(days=1),
            )
        else:
            target = 0.0
        last = (
            db.query(TimeEntry.start_at)
            .filter(TimeEntry.user_id == emp.id)
            .order_by(TimeEntry.start_at.desc())
            .first()
        )
        vac_remaining = remaining_vacation_days(db, emp, reference.year)
        vac_anspruch = float(emp.annual_vacation_days or 0)
        rows.append(EmployeeRow(
            id=emp.id,
            full_name=emp.full_name or emp.username,
            username=emp.username,
            target_hours_month=target,
            actual_hours_month=actual,
            balance_hours=saldo_for_user(db, emp, reference),
            vacation_used=round(vac_anspruch - vac_remaining, 2),
            vacation_remaining=vac_remaining,
            sick_days_month=_sick_days(db, emp.id, m_start.date(),
                                       m_end.date() - timedelta(days=1)),
            sick_days_year=_sick_days(db, emp.id,
                                      date(reference.year, 1, 1),
                                      date(reference.year, 12, 31)),
            last_activity=last[0].date() if last else None,
            offboarded_at=emp.offboarded_at,
        ))

    return EmployerDashboard(
        reference_month=reference.strftime("%Y-%m"),
        employees=rows,
    )
