"""Live-Timer: laufender Eintrag (end_at leer), nur einer gleichzeitig."""
from datetime import datetime

import pytest
from fastapi import HTTPException

from app.models import Role, User
from app.routers.entries import create_entry, running_entry
from app.schemas import TimeEntryIn


def _user(db):
    u = User(username="anna", email="a@x.de", password_hash="x", role=Role.EMPLOYEE)
    db.add(u); db.commit(); db.refresh(u)
    return u


def test_start_creates_running_and_is_returned(db_session):
    u = _user(db_session)
    res = create_entry(
        TimeEntryIn(start_at=datetime(2026, 7, 13, 9, 0), end_at=None, break_minutes=0),
        user=u, db=db_session)
    assert res.entry.end_at is None
    r = running_entry(user=u, db=db_session)
    assert r is not None and r.id == res.entry.id


def test_only_one_running_at_a_time(db_session):
    u = _user(db_session)
    create_entry(TimeEntryIn(start_at=datetime(2026, 7, 13, 9, 0), end_at=None, break_minutes=0),
                 user=u, db=db_session)
    with pytest.raises(HTTPException) as exc:
        create_entry(TimeEntryIn(start_at=datetime(2026, 7, 13, 10, 0), end_at=None, break_minutes=0),
                     user=u, db=db_session)
    assert exc.value.status_code == 409
