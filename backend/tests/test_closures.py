"""Monatsabschluss: Statusübergänge, Schreib-Sperre, Rechte.

Direktaufrufe der Router-/Helper-Funktionen (wie test_projects.py).
"""
from datetime import date, datetime

import pytest
from fastapi import HTTPException

from app.closures import assert_month_editable, closure_status
from app.models import Role, User
from app.routers import closures as cl
from app.routers import entries as entries_router
from app.schemas import ClosureAction, TimeEntryIn


def _user(db, uname, role=Role.EMPLOYEE, supervisor_id=None):
    u = User(username=uname, email=f"{uname}@x.de", password_hash="x",
             role=role, supervisor_id=supervisor_id)
    db.add(u); db.commit(); db.refresh(u)
    return u


def test_submit_approve_reopen_flow(db_session):
    boss = _user(db_session, "boss", Role.EMPLOYER)
    emp = _user(db_session, "anna", supervisor_id=boss.id)

    assert closure_status(db_session, emp.id, 2026, 5) == "open"

    out = cl.submit(ClosureAction(year=2026, month=5), actor=emp, db=db_session)
    assert out.status == "submitted"

    out = cl.approve(ClosureAction(year=2026, month=5, user_id=emp.id), actor=boss, db=db_session)
    assert out.status == "approved"

    cl.reopen(ClosureAction(year=2026, month=5, user_id=emp.id), actor=boss, db=db_session)
    assert closure_status(db_session, emp.id, 2026, 5) == "open"


def test_approved_blocks_everyone(db_session):
    boss = _user(db_session, "boss", Role.EMPLOYER)
    emp = _user(db_session, "anna", supervisor_id=boss.id)
    cl.approve(ClosureAction(year=2026, month=5, user_id=emp.id), actor=boss, db=db_session)
    d = date(2026, 5, 15)
    with pytest.raises(HTTPException) as e1:
        assert_month_editable(db_session, emp.id, d, emp)
    assert e1.value.status_code == 409
    with pytest.raises(HTTPException) as e2:
        assert_month_editable(db_session, emp.id, d, boss)   # sogar der AG
    assert e2.value.status_code == 409


def test_submitted_blocks_only_the_employee(db_session):
    boss = _user(db_session, "boss", Role.EMPLOYER)
    emp = _user(db_session, "anna", supervisor_id=boss.id)
    cl.submit(ClosureAction(year=2026, month=5, user_id=emp.id), actor=emp, db=db_session)
    d = date(2026, 5, 15)
    with pytest.raises(HTTPException):
        assert_month_editable(db_session, emp.id, d, emp)    # MA gesperrt
    assert_month_editable(db_session, emp.id, d, boss)       # AG darf (kein Raise)


def test_foreign_employer_cannot_approve(db_session):
    boss1 = _user(db_session, "b1", Role.EMPLOYER)
    boss2 = _user(db_session, "b2", Role.EMPLOYER)
    emp = _user(db_session, "anna", supervisor_id=boss1.id)
    with pytest.raises(HTTPException) as e:
        cl.approve(ClosureAction(year=2026, month=5, user_id=emp.id), actor=boss2, db=db_session)
    assert e.value.status_code == 403


def test_entry_create_blocked_in_approved_month(db_session):
    boss = _user(db_session, "boss", Role.EMPLOYER)
    emp = _user(db_session, "anna", supervisor_id=boss.id)
    cl.approve(ClosureAction(year=2026, month=5, user_id=emp.id), actor=boss, db=db_session)
    payload = TimeEntryIn(start_at=datetime(2026, 5, 4, 9, 0),
                          end_at=datetime(2026, 5, 4, 17, 0), break_minutes=30)
    with pytest.raises(HTTPException) as e:
        entries_router.create_entry(payload, user=emp, db=db_session)
    assert e.value.status_code == 409
