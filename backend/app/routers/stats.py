"""Aggregations: day/week/month totals depending on billing mode + year overview."""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.absences import remaining_vacation_days
from app.balance import saldo_for_user, target_hours_for_period
from app.database import get_db
from app.models import (
    Absence, AbsenceStatus, AbsenceType, BillingMode, Project, TimeEntry, User,
)
from app.permissions import require_active_user, visible_user_ids
from app.schemas import (
    BalanceOut, MonthSummary, PeriodKpiOut, PeriodSummary,
    ProjectReportEmployee, ProjectReportOut, ProjectReportRow, YearOverview,
)

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
    user: User = Depends(require_active_user),
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


def _resolve_target(actor: User, user_id: int | None, db: Session) -> User:
    target_id = user_id if user_id is not None else actor.id
    if target_id != actor.id and target_id not in visible_user_ids(actor, db):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    target = db.query(User).filter(User.id == target_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User nicht gefunden.")
    return target


@router.get("/balance", response_model=BalanceOut)
def balance(
    as_of: date = Query(default_factory=date.today, description="Stichtag, default heute"),
    user_id: int | None = Query(None, description="Admin/AG: anderer MA"),
    actor: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Saldo-Kennzahl für die UI. Adressiert den Bug, dass die alte
    year-overview-Antwort `balance_at_year_end` für das laufende Jahr
    das ganze Jahres-Soll gegen das aktuelle Ist rechnet – Default
    `as_of=heute` liefert hier die realistische Zahl."""
    target = _resolve_target(actor, user_id, db)

    saldo = saldo_for_user(db, target, as_of)

    # Ist und Soll separat – fürs UI hilfreich, weil so klar wird,
    # woher der Saldo kommt (z. B. "16 h Ist gegen 48 h Soll").
    until_dt = datetime.combine(as_of + timedelta(days=1), time.min)
    entries = db.query(TimeEntry).filter(
        TimeEntry.user_id == target.id,
        TimeEntry.start_at < until_dt,
    ).all()
    actual = _net(entries)

    if target.billing_mode == BillingMode.SALARY and target.hire_date:
        target_hours = target_hours_for_period(db, target, target.hire_date, as_of)
    else:
        target_hours = 0.0

    return BalanceOut(
        balance_hours=round(saldo, 2),
        as_of=as_of,
        actual_hours_to_date=round(actual, 2),
        target_hours_to_date=round(target_hours, 2),
    )


@router.get("/period", response_model=PeriodKpiOut)
def period_kpis(
    start: date = Query(...),
    end: date = Query(..., description="inclusive"),
    user_id: int | None = Query(None),
    actor: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """KPIs für einen frei wählbaren Zeitraum. Vom Dashboard-Tab
    benutzt, der einen Preset- oder Custom-Range-Filter setzt."""
    if end < start:
        raise HTTPException(status_code=422, detail="end < start.")
    target = _resolve_target(actor, user_id, db)

    s_dt = datetime.combine(start, time.min)
    e_dt = datetime.combine(end + timedelta(days=1), time.min)
    entries = db.query(TimeEntry).filter(
        TimeEntry.user_id == target.id,
        TimeEntry.start_at >= s_dt,
        TimeEntry.start_at < e_dt,
    ).all()
    actual = _net(entries)

    if target.billing_mode == BillingMode.SALARY:
        tgt = target_hours_for_period(db, target, start, end)
    else:
        tgt = 0.0

    vac = _absence_days_in_range(db, target.id, (AbsenceType.VACATION,), start, end)
    sick = _absence_days_in_range(db, target.id, (AbsenceType.SICK,), start, end)
    other = _absence_days_in_range(
        db, target.id,
        (AbsenceType.UNPAID, AbsenceType.SPECIAL, AbsenceType.PARENTAL, AbsenceType.TRAINING),
        start, end,
    )

    return PeriodKpiOut(
        start=start, end=end,
        actual_hours=round(actual, 2),
        target_hours=round(tgt, 2),
        vacation_days=vac, sick_days=sick, other_absence_days=other,
    )


@router.get("/projects", response_model=ProjectReportOut)
def project_report(
    start: date = Query(...),
    end: date = Query(..., description="inclusive"),
    user_id: int | None = Query(None, description="optional: nur ein Mitarbeiter"),
    actor: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Stunden je Projekt im Zeitraum, mit Aufschlüsselung je Mitarbeiter.
    Ohne user_id über alle sichtbaren Mitarbeiter (Team des Arbeitgebers)."""
    if end < start:
        raise HTTPException(status_code=422, detail="end < start.")
    if user_id is not None:
        if user_id != actor.id and user_id not in visible_user_ids(actor, db):
            raise HTTPException(status_code=403, detail="Kein Zugriff.")
        target_ids = {user_id}
    else:
        target_ids = visible_user_ids(actor, db)

    s_dt = datetime.combine(start, time.min)
    e_dt = datetime.combine(end + timedelta(days=1), time.min)
    entries = db.query(TimeEntry).filter(
        TimeEntry.user_id.in_(target_ids),
        TimeEntry.start_at >= s_dt,
        TimeEntry.start_at < e_dt,
        TimeEntry.end_at.isnot(None),
    ).all()

    names = {
        u.id: (u.full_name or u.username)
        for u in db.query(User).filter(User.id.in_(target_ids)).all()
    }

    per_project: dict[int, dict] = {}
    no_project = 0.0
    for e in entries:
        net = max(0.0, (e.end_at - e.start_at).total_seconds() / 3600 - e.break_minutes / 60)
        if e.project_id is None:
            no_project += net
            continue
        slot = per_project.setdefault(e.project_id, {"hours": 0.0, "by_emp": {}})
        slot["hours"] += net
        slot["by_emp"][e.user_id] = slot["by_emp"].get(e.user_id, 0.0) + net

    projects = {}
    if per_project:
        projects = {
            p.id: p for p in
            db.query(Project).filter(Project.id.in_(list(per_project.keys()))).all()
        }

    rows: list[ProjectReportRow] = []
    for pid, slot in per_project.items():
        p = projects.get(pid)
        rows.append(ProjectReportRow(
            project_id=pid,
            name=p.name if p else "—",
            client=p.client if p else None,
            color=p.color if p else None,
            hours_budget=p.hours_budget if p else None,
            total_hours=round(slot["hours"], 2),
            by_employee=[
                ProjectReportEmployee(user_id=uid, name=names.get(uid, str(uid)), hours=round(h, 2))
                for uid, h in sorted(slot["by_emp"].items(), key=lambda kv: -kv[1])
            ],
        ))
    rows.sort(key=lambda r: -r.total_hours)

    return ProjectReportOut(
        start=start, end=end, rows=rows, no_project_hours=round(no_project, 2),
    )


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
    actor: User = Depends(require_active_user),
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

    today = date.today()
    months: list[MonthSummary] = []
    total_actual = 0.0
    total_target = 0.0
    sick_total = 0

    for m in range(1, 13):
        m_start = date(year, m, 1)
        # Zukunftsmonate komplett überspringen – kein Soll, kein Ist,
        # kein Saldo. Strikte Lesart von Lars' Refactor-Spec: nirgendwo
        # Soll-/Saldo-Werte für die Zukunft.
        if m_start > today:
            break
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

        # Soll-Stunden (nur Salary, sonst 0). Beim laufenden Monat
        # bleibt das Soll für den ganzen Monat stehen – das zeigt dem
        # User, was er bis Monatsende erreichen muss. Das ist keine
        # Saldo-Hochrechnung.
        if target.billing_mode == BillingMode.SALARY:
            tgt = target_hours_for_period(db, target, m_start, m_end_inclusive)
        else:
            tgt = 0.0

        # balance_at_end: nur für abgeschlossene Monate. Für den
        # laufenden Monat None – wir sind nicht am Monatsende.
        if m_end_inclusive < today:
            bal = round(saldo_for_user(db, target, m_end_inclusive), 2)
        else:
            bal = None

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
            balance_at_end=bal,
            vacation_days=vac,
            sick_days=sick,
            other_absence_days=other,
        ))
        total_actual += actual
        total_target += tgt
        sick_total += sick

    balance_at_year_start = saldo_for_user(db, target, date(year - 1, 12, 31))
    vac_remaining = remaining_vacation_days(db, target, year)
    vac_used = sum(m.vacation_days for m in months)

    return YearOverview(
        year=year,
        months=months,
        total_actual=round(total_actual, 2),
        total_target=round(total_target, 2),
        balance_at_year_start=round(balance_at_year_start, 2),
        vacation_used=vac_used,
        vacation_remaining=vac_remaining,
        sick_total=sick_total,
    )
