from datetime import datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.feedback_delivery import _payload, deliver_pending_feedback
from app.models import Feedback, FeedbackKind, FeedbackStatus, Role, User


def _database():
    engine = create_engine(
        "sqlite:///:memory:", future=True,
        connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine, sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _settings():
    return SimpleNamespace(
        vrwb_admin_feedback_url="https://admin.example.test/api/feedback/intake",
        vrwb_admin_feedback_token="central-test-token",
        app_base_url="https://clok.example.test",
    )


def test_payload_uses_existing_feedback_id_and_reporter():
    reporter = User(
        id=7, username="anna", email="anna@example.test", full_name="Anna Beispiel",
        password_hash="x", role=Role.EMPLOYEE,
    )
    feedback = Feedback(
        id=42, reporter_user_id=7, kind=FeedbackKind.BUG,
        status=FeedbackStatus.OPEN, title="Timer stoppt nicht",
        description="Der Timer läuft nach dem Stoppen weiter.",
        created_at=datetime(2026, 9, 10, 8, 30),
    )
    payload = _payload(_settings(), feedback, reporter)
    assert payload["externalId"] == "42"
    assert payload["kind"] == "bug"
    assert payload["reporterEmail"] == "anna@example.test"
    assert payload["pageUrl"] == "https://clok.example.test/feedback"


def test_failed_delivery_is_persisted_and_retried(monkeypatch):
    engine, sessions = _database()
    with sessions() as db:
        reporter = User(
            username="anna", email="anna@example.test", full_name="Anna Beispiel",
            password_hash="x", role=Role.EMPLOYEE,
        )
        db.add(reporter)
        db.flush()
        db.add(Feedback(
            reporter_user_id=reporter.id, kind=FeedbackKind.IMPROVEMENT,
            status=FeedbackStatus.OPEN, title="Übersicht verbessern",
            description="Die Wochenübersicht könnte kompakter sein.",
        ))
        db.commit()

    monkeypatch.setattr(
        "app.feedback_delivery.send_to_admin",
        lambda *args: (_ for _ in ()).throw(OSError("admin unavailable")),
    )
    assert deliver_pending_feedback(settings=_settings(), session_factory=sessions) == 1
    with sessions() as db:
        feedback = db.query(Feedback).one()
        assert feedback.central_delivery_status == "failed"
        assert feedback.central_delivery_attempts == 1
        assert feedback.central_delivery_error == "admin unavailable"
        feedback.central_next_attempt_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()

    monkeypatch.setattr("app.feedback_delivery.send_to_admin", lambda *args: True)
    assert deliver_pending_feedback(settings=_settings(), session_factory=sessions) == 1
    with sessions() as db:
        feedback = db.query(Feedback).one()
        assert feedback.central_delivery_status == "sent"
        assert feedback.central_delivery_attempts == 2
        assert feedback.central_delivered_at is not None
    engine.dispose()
