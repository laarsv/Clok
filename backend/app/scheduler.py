"""APScheduler-Bootstrap und zeitbasierte Notification-Jobs.

Läuft im FastAPI-Prozess. Drei Jobs:

- month_complete_check (täglich 23:55):
    Wenn der heutige Tag der letzte Werktag des Monats für einen MA ist
    UND er heute einen Eintrag hat → Mail an Vorgesetzten.

- reminder_no_entry (täglich 18:00):
    Wenn die zwei letzten Werktage vor heute (BL-spezifisch, ohne
    Urlaub/Krankheit) keinen Eintrag haben → Mail an MA.
    Heutiger Tag wird ausgespart.

- remaining_vacation_check (1. des Monats, ab Oktober):
    Wenn ein MA noch >50% seines Jahresanspruchs übrig hat → Mail.

Bewusst kein Persistent-Job-Store: Idempotenz wird über
notification_log (UNIQUE user+kind+period_key) erreicht. Wenn der
Container 5× am Tag neu startet, wird die Mail trotzdem nur einmal
verschickt.
"""
from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.absences import remaining_vacation_days, working_days_in_range
from app.database import SessionLocal
from app.holidays_de import is_holiday
from app.models import Role, TimeEntry, User
from app.notifications.service import NotificationKind, notify

log = logging.getLogger(__name__)


def _last_workday_of_month(today: date, state: str | None) -> date:
    days_in_month = monthrange(today.year, today.month)[1]
    cur = date(today.year, today.month, days_in_month)
    while cur.weekday() >= 5 or is_holiday(cur, state):
        cur -= timedelta(days=1)
    return cur


def _previous_workdays(today: date, state: str | None, count: int) -> list[date]:
    out: list[date] = []
    cur = today - timedelta(days=1)
    while len(out) < count:
        if cur.weekday() < 5 and not is_holiday(cur, state):
            out.append(cur)
        cur -= timedelta(days=1)
        if cur.year < today.year - 1:  # safety
            break
    return out


def _has_entry_on(db, user_id: int, day: date) -> bool:
    start = datetime.combine(day, datetime.min.time())
    end = start + timedelta(days=1)
    return db.query(
        db.query(TimeEntry).filter(
            TimeEntry.user_id == user_id,
            TimeEntry.start_at >= start,
            TimeEntry.start_at < end,
        ).exists()
    ).scalar()


def _is_absent_on(db, user, day: date) -> bool:
    """True, wenn approved Urlaub/Krankheit den Tag abdeckt."""
    return working_days_in_range(db, user, day, day, include_absences=True) == 0 \
        and (day.weekday() < 5 and not is_holiday(
            day, user.federal_state.value if user.federal_state else None,
        ))


def job_month_complete():
    """Sendet Mail an Vorgesetzte, wenn MA letzten Werktag des Monats getrackt hat."""
    today = date.today()
    db = SessionLocal()
    try:
        employees = db.query(User).filter(
            User.role == Role.EMPLOYEE,
            User.offboarded_at.is_(None),
        ).all()
        for emp in employees:
            state = emp.federal_state.value if emp.federal_state else None
            last = _last_workday_of_month(today, state)
            if last != today:
                continue
            if not _has_entry_on(db, emp.id, today):
                continue
            supervisor = (
                db.query(User).filter(User.id == emp.supervisor_id).first()
                if emp.supervisor_id else None
            )
            if not supervisor:
                continue
            ctx = {
                "requester": {
                    "first_name": (emp.full_name or emp.username).split()[0],
                    "full_name": emp.full_name or emp.username,
                },
                "approver": {
                    "first_name": (supervisor.full_name or supervisor.username).split()[0],
                },
                "month": today.strftime("%m/%Y"),
                "link": "",
            }
            notify(
                db,
                kind=NotificationKind.MONTH_COMPLETE,
                recipient=supervisor,
                ctx=ctx,
                period_key=f"{emp.id}:{today.strftime('%Y-%m')}",
            )
    finally:
        db.close()


def job_reminder_no_entry():
    today = date.today()
    db = SessionLocal()
    try:
        employees = db.query(User).filter(
            User.role == Role.EMPLOYEE,
            User.offboarded_at.is_(None),
        ).all()
        for emp in employees:
            state = emp.federal_state.value if emp.federal_state else None
            two = _previous_workdays(today, state, 2)
            if len(two) < 2:
                continue
            # Nur wenn beide Tage NICHT durch Urlaub/Krankheit abgedeckt sind.
            if any(_is_absent_on(db, emp, d) for d in two):
                continue
            if any(_has_entry_on(db, emp.id, d) for d in two):
                continue
            ctx = {
                "requester": {
                    "first_name": (emp.full_name or emp.username).split()[0],
                    "full_name": emp.full_name or emp.username,
                },
                "approver": {"first_name": ""},
                "link": "",
            }
            notify(
                db,
                kind=NotificationKind.REMINDER_NO_ENTRY,
                recipient=emp,
                ctx=ctx,
                period_key=f"{two[0].isoformat()}",
            )
    finally:
        db.close()


def job_remaining_vacation():
    today = date.today()
    if today.month < 10:
        return
    db = SessionLocal()
    try:
        employees = db.query(User).filter(
            User.role == Role.EMPLOYEE,
            User.offboarded_at.is_(None),
        ).all()
        for emp in employees:
            anspruch = float(emp.annual_vacation_days or 0)
            if anspruch <= 0:
                continue
            remaining = remaining_vacation_days(db, emp, today.year)
            if remaining / anspruch <= 0.5:
                continue
            ctx = {
                "requester": {
                    "first_name": (emp.full_name or emp.username).split()[0],
                    "full_name": emp.full_name or emp.username,
                },
                "approver": {"first_name": ""},
                "remaining": remaining,
                "link": "",
            }
            notify(
                db,
                kind=NotificationKind.REMINDER_REMAINING_VACATION,
                recipient=emp,
                ctx=ctx,
                period_key=f"{today.strftime('%Y-%m')}",
            )
    finally:
        db.close()


_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    sched = BackgroundScheduler(timezone="Europe/Berlin")
    sched.add_job(job_month_complete, CronTrigger(hour=23, minute=55), id="month_complete")
    sched.add_job(job_reminder_no_entry, CronTrigger(hour=18, minute=0), id="reminder_no_entry")
    sched.add_job(job_remaining_vacation, CronTrigger(day=1, hour=8, minute=0),
                  id="remaining_vacation")
    sched.start()
    _scheduler = sched
    log.info("APScheduler gestartet")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
