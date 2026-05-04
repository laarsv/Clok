from datetime import date

from app.absences import remaining_vacation_days, working_days_in_range
from app.models import Absence, AbsenceStatus, AbsenceType, FederalState, Role, User


def _make_user(db, **kwargs):
    defaults = dict(
        username="lars",
        email="lars@example.com",
        password_hash="x",
        role=Role.EMPLOYEE,
        annual_vacation_days=30,
        federal_state=FederalState.BW,
    )
    defaults.update(kwargs)
    user = User(**defaults)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_werktage_ohne_feiertag(db_session):
    user = _make_user(db_session)
    # Mo–Fr in einer ruhigen Woche ohne Feiertag (KW 4/2026: 19.–25. Januar)
    assert working_days_in_range(
        db_session, user, date(2026, 1, 19), date(2026, 1, 25)
    ) == 5


def test_werktage_mit_feiertag_in_bw(db_session):
    user = _make_user(db_session, federal_state=FederalState.BW)
    # Karfreitag 03.04.2026 fällt auf Freitag → Werktag wird ausgeklammert
    assert working_days_in_range(
        db_session, user, date(2026, 3, 30), date(2026, 4, 3)
    ) == 4


def test_resturlaub_zieht_pending_und_approved_ab(db_session):
    user = _make_user(db_session, annual_vacation_days=30)
    # 5 Werktage approved
    db_session.add(Absence(
        user_id=user.id,
        type=AbsenceType.VACATION,
        start_date=date(2026, 7, 6),
        end_date=date(2026, 7, 10),
        status=AbsenceStatus.APPROVED,
    ))
    # 2 Werktage pending
    db_session.add(Absence(
        user_id=user.id,
        type=AbsenceType.VACATION,
        start_date=date(2026, 8, 3),
        end_date=date(2026, 8, 4),
        status=AbsenceStatus.PENDING,
    ))
    db_session.commit()
    assert remaining_vacation_days(db_session, user, 2026) == 23


def test_resturlaub_initial_im_eintrittsjahr(db_session):
    user = _make_user(
        db_session,
        annual_vacation_days=30,
        initial_remaining_vacation=5,
        hire_date=date(2026, 4, 1),
    )
    assert remaining_vacation_days(db_session, user, 2026) == 35
    # im Folgejahr nicht mehr
    assert remaining_vacation_days(db_session, user, 2027) == 30
