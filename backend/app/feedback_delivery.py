"""Reliable, idempotent delivery of vrwb_clok feedback to VRWB Admin."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging

import httpx

from app.config import get_settings
from app.database import SessionLocal
from app.models import Feedback, User

log = logging.getLogger(__name__)


def _payload(settings, feedback: Feedback, reporter: User) -> dict:
    created_at = feedback.created_at.replace(tzinfo=timezone.utc)
    return {
        "externalId": str(feedback.id),
        "kind": feedback.kind.value,
        "title": feedback.title,
        "description": feedback.description,
        "reporterName": reporter.full_name or reporter.username,
        "reporterEmail": reporter.email,
        "pageUrl": f"{settings.app_base_url.rstrip('/')}/feedback",
        "route": "/feedback",
        "appVersion": "vrwb_clok",
        "createdAt": created_at.isoformat().replace("+00:00", "Z"),
    }


def send_to_admin(settings, feedback: Feedback, reporter: User) -> bool:
    if not settings.vrwb_admin_feedback_url or not settings.vrwb_admin_feedback_token:
        return False
    response = httpx.post(
        settings.vrwb_admin_feedback_url,
        headers={"Authorization": f"Bearer {settings.vrwb_admin_feedback_token}"},
        json=_payload(settings, feedback, reporter),
        timeout=10,
    )
    if response.status_code not in {200, 201}:
        raise RuntimeError(f"VRWB Admin antwortete mit HTTP {response.status_code}.")
    return True


def _record_result(feedback: Feedback, *, sent: bool, error: Exception | None = None) -> None:
    now = datetime.utcnow()
    feedback.central_delivery_attempts += 1
    if sent:
        feedback.central_delivery_status = "sent"
        feedback.central_delivery_error = None
        feedback.central_next_attempt_at = None
        feedback.central_delivered_at = now
        return
    feedback.central_delivery_status = "failed"
    feedback.central_delivery_error = " ".join(str(error or "Unbekannter Transportfehler.").splitlines())[:500]
    seconds = min(60 * (2 ** min(feedback.central_delivery_attempts - 1, 8)), 6 * 60 * 60)
    feedback.central_next_attempt_at = now + timedelta(seconds=seconds)


def deliver_pending_feedback(*, limit: int = 25, settings=None, session_factory=SessionLocal) -> int:
    settings = settings or get_settings()
    if not settings.vrwb_admin_feedback_url or not settings.vrwb_admin_feedback_token:
        return 0
    now = datetime.utcnow()
    db = session_factory()
    try:
        rows = (
            db.query(Feedback, User)
            .join(User, User.id == Feedback.reporter_user_id)
            .filter(
                Feedback.central_delivery_status.in_(("pending", "failed")),
                (Feedback.central_next_attempt_at.is_(None))
                | (Feedback.central_next_attempt_at <= now),
            )
            .order_by(Feedback.created_at)
            .limit(limit)
            .all()
        )
        for feedback, reporter in rows:
            try:
                sent = send_to_admin(settings, feedback, reporter)
                if not sent:
                    continue
                _record_result(feedback, sent=True)
            except Exception as exc:
                _record_result(feedback, sent=False, error=exc)
        db.commit()
        return len(rows)
    finally:
        db.close()


def job_feedback_delivery() -> None:
    try:
        delivered = deliver_pending_feedback()
        if delivered:
            log.info("Zentrale Feedbackzustellung verarbeitet: %d", delivered)
    except Exception:
        log.exception("Zentrale Feedbackzustellung fehlgeschlagen")
