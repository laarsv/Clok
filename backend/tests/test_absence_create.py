"""Arbeitgeber trägt Abwesenheiten für Mitarbeiter ein (auch rückwirkend).

Testet die Berechtigungs- und Auto-Genehmigungs-Logik in
`app.routers.absences.create_absence` direkt (ohne HTTP-Layer). Es werden
bewusst Fälle gewählt, in denen der Eintragende zugleich der Vorgesetzte ist
bzw. kein Vorgesetzter hinterlegt ist – dann löst der Endpoint keine
Mail-Benachrichtigung aus und bleibt seiteneffektfrei.
"""
from datetime import date

import pytest
from fastapi import HTTPException

from app.models import Absence, AbsenceStatus, AbsenceType, Role, User
from app.routers.absences import create_absence, team_absences
from app.schemas import AbsenceIn


def _user(db, **kw):
    defaults = dict(
        username="u", email="u@example.com", password_hash="x", role=Role.EMPLOYEE,
    )
    defaults.update(kw)
    u = User(**defaults)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_employer_traegt_urlaub_rueckwirkend_ein(db_session):
    boss = _user(db_session, username="boss", email="boss@example.com", role=Role.EMPLOYER)
    emp = _user(db_session, username="anna", email="anna@example.com",
                supervisor_id=boss.id)

    payload = AbsenceIn(
        type=AbsenceType.VACATION,
        start_date=date(2026, 3, 2),  # liegt in der Vergangenheit
        end_date=date(2026, 3, 6),
        user_id=emp.id,
    )
    out = create_absence(payload, user=boss, db=db_session)

    assert out.user_id == emp.id
    # Vom Arbeitgeber eingetragen -> sofort genehmigt, kein offener Antrag.
    assert out.status == AbsenceStatus.APPROVED


def test_employer_traegt_sonderurlaub_ein(db_session):
    """Nicht mehr nur Krankheit: jede Art ist für den eigenen MA erlaubt."""
    boss = _user(db_session, username="boss", email="boss@example.com", role=Role.EMPLOYER)
    emp = _user(db_session, username="anna", email="anna@example.com",
                supervisor_id=boss.id)

    payload = AbsenceIn(
        type=AbsenceType.SPECIAL,
        start_date=date(2026, 1, 12),
        end_date=date(2026, 1, 12),
        user_id=emp.id,
    )
    out = create_absence(payload, user=boss, db=db_session)
    assert out.status == AbsenceStatus.APPROVED


def test_employer_darf_nicht_fuer_fremden_mitarbeiter(db_session):
    boss1 = _user(db_session, username="boss1", email="b1@example.com", role=Role.EMPLOYER)
    boss2 = _user(db_session, username="boss2", email="b2@example.com", role=Role.EMPLOYER)
    emp = _user(db_session, username="anna", email="anna@example.com",
                supervisor_id=boss1.id)

    payload = AbsenceIn(
        type=AbsenceType.VACATION,
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 6),
        user_id=emp.id,
    )
    with pytest.raises(HTTPException) as exc:
        create_absence(payload, user=boss2, db=db_session)
    assert exc.value.status_code == 403


def test_ende_vor_start_wird_abgelehnt(db_session):
    boss = _user(db_session, username="boss", email="boss@example.com", role=Role.EMPLOYER)
    emp = _user(db_session, username="anna", email="anna@example.com",
                supervisor_id=boss.id)
    payload = AbsenceIn(
        type=AbsenceType.VACATION,
        start_date=date(2026, 3, 6),
        end_date=date(2026, 3, 2),
        user_id=emp.id,
    )
    with pytest.raises(HTTPException) as exc:
        create_absence(payload, user=boss, db=db_session)
    assert exc.value.status_code == 422


def test_team_absences_lists_employees_and_absences(db_session):
    boss = _user(db_session, username="boss", email="boss@x.de", role=Role.EMPLOYER)
    emp = _user(db_session, username="anna", email="anna@x.de", supervisor_id=boss.id)
    db_session.add(Absence(user_id=emp.id, type=AbsenceType.VACATION,
                           start_date=date(2026, 7, 6), end_date=date(2026, 7, 10),
                           status=AbsenceStatus.APPROVED))
    db_session.commit()

    out = team_absences(from_=date(2026, 7, 1), to=date(2026, 7, 31), actor=boss, db=db_session)
    assert [e.name for e in out.employees] == ["anna"]
    assert len(out.absences) == 1

    with pytest.raises(HTTPException) as exc:
        team_absences(from_=date(2026, 7, 1), to=date(2026, 7, 31), actor=emp, db=db_session)
    assert exc.value.status_code == 403
