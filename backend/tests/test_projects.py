"""Projekte: Anlegen/Unique, Sichtbarkeit je Rolle, Entry-Verknüpfung,
Auswertung. Direktaufrufe der Router-Funktionen (kein HTTP/notify), analog
zu test_absence_create.py.
"""
from datetime import date, datetime

import pytest
from fastapi import HTTPException

from app.models import Role, User
from app.routers import entries as entries_router
from app.routers import projects as projects_router
from app.routers import stats as stats_router
from app.schemas import ProjectIn, TimeEntryIn


def _user(db, **kw):
    defaults = dict(username="u", email="u@example.com", password_hash="x", role=Role.EMPLOYEE)
    defaults.update(kw)
    u = User(**defaults)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_create_and_unique_name(db_session):
    boss = _user(db_session, username="boss", email="boss@x.de", role=Role.EMPLOYER)
    out = projects_router.create_project(ProjectIn(name="Website"), user=boss, db=db_session)
    assert out.name == "Website"
    assert out.owner_user_id == boss.id
    assert out.archived is False

    with pytest.raises(HTTPException) as exc:
        projects_router.create_project(ProjectIn(name="Website"), user=boss, db=db_session)
    assert exc.value.status_code == 409


def test_employee_sees_only_supervisor_projects(db_session):
    boss = _user(db_session, username="boss", email="boss@x.de", role=Role.EMPLOYER)
    other = _user(db_session, username="boss2", email="boss2@x.de", role=Role.EMPLOYER)
    emp = _user(db_session, username="anna", email="anna@x.de", supervisor_id=boss.id)

    projects_router.create_project(ProjectIn(name="A"), user=boss, db=db_session)
    projects_router.create_project(ProjectIn(name="B"), user=other, db=db_session)

    listed = projects_router.list_projects(include_archived=False, user=emp, db=db_session)
    assert {p.name for p in listed} == {"A"}


def test_archived_excluded_unless_requested(db_session):
    boss = _user(db_session, username="boss", email="boss@x.de", role=Role.EMPLOYER)
    p = projects_router.create_project(ProjectIn(name="Alt"), user=boss, db=db_session)
    projects_router.update_project(
        p.id, ProjectIn(name="Alt", archived=True), user=boss, db=db_session,
    )
    assert projects_router.list_projects(include_archived=False, user=boss, db=db_session) == []
    assert len(projects_router.list_projects(include_archived=True, user=boss, db=db_session)) == 1


def test_entry_rejects_foreign_project(db_session):
    boss = _user(db_session, username="boss", email="boss@x.de", role=Role.EMPLOYER)
    other = _user(db_session, username="boss2", email="boss2@x.de", role=Role.EMPLOYER)
    emp = _user(db_session, username="anna", email="anna@x.de", supervisor_id=boss.id)
    foreign = projects_router.create_project(ProjectIn(name="Fremd"), user=other, db=db_session)

    payload = TimeEntryIn(
        start_at=datetime(2026, 3, 2, 9, 0),
        end_at=datetime(2026, 3, 2, 17, 0),
        break_minutes=30,
        project_id=foreign.id,
    )
    with pytest.raises(HTTPException) as exc:
        entries_router.create_entry(payload, user=emp, db=db_session)
    assert exc.value.status_code == 403


def test_project_report_aggregates_per_project_and_employee(db_session):
    boss = _user(db_session, username="boss", email="boss@x.de", role=Role.EMPLOYER)
    emp1 = _user(db_session, username="anna", email="anna@x.de", supervisor_id=boss.id)
    emp2 = _user(db_session, username="tom", email="tom@x.de", supervisor_id=boss.id)
    proj = projects_router.create_project(ProjectIn(name="Website"), user=boss, db=db_session)

    # emp1: 8,0 h auf Projekt; emp2: 4,0 h auf Projekt; emp1: 2,0 h ohne Projekt
    entries_router.create_entry(TimeEntryIn(
        start_at=datetime(2026, 3, 2, 9, 0), end_at=datetime(2026, 3, 2, 17, 30),
        break_minutes=30, project_id=proj.id,
    ), user=emp1, db=db_session)
    entries_router.create_entry(TimeEntryIn(
        start_at=datetime(2026, 3, 3, 9, 0), end_at=datetime(2026, 3, 3, 13, 0),
        break_minutes=0, project_id=proj.id,
    ), user=emp2, db=db_session)
    entries_router.create_entry(TimeEntryIn(
        start_at=datetime(2026, 3, 4, 9, 0), end_at=datetime(2026, 3, 4, 11, 0),
        break_minutes=0, project_id=None,
    ), user=emp1, db=db_session)

    rep = stats_router.project_report(
        start=date(2026, 3, 1), end=date(2026, 3, 31), user_id=None, actor=boss, db=db_session,
    )
    assert len(rep.rows) == 1
    row = rep.rows[0]
    assert row.project_id == proj.id
    assert round(row.total_hours, 2) == 12.0
    assert {e.user_id for e in row.by_employee} == {emp1.id, emp2.id}
    assert round(rep.no_project_hours, 2) == 2.0
