"""User-Feedback: Bugs, Ideen, Verbesserungen.

Mitarbeiter und Arbeitgeber reichen Feedback ein. Admin sieht alle
Einträge und kann Status setzen + antworten. Die Mitarbeiter sehen
ihre eigenen Einträge inkl. Admin-Antwort als Read-only.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Feedback, FeedbackKind, FeedbackStatus, Role, User,
)
from app.schemas import FeedbackIn, FeedbackOut, FeedbackUpdate

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


def _to_out(fb: Feedback, reporter: Optional[User]) -> FeedbackOut:
    return FeedbackOut(
        id=fb.id,
        reporter_user_id=fb.reporter_user_id,
        reporter_username=reporter.username if reporter else None,
        reporter_full_name=reporter.full_name if reporter else None,
        reporter_role=reporter.role if reporter else None,
        kind=fb.kind,
        status=fb.status,
        title=fb.title,
        description=fb.description,
        admin_response=fb.admin_response,
        created_at=fb.created_at,
        updated_at=fb.updated_at,
        decided_at=fb.decided_at,
        decided_by=fb.decided_by,
    )


@router.post("", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
def create_feedback(
    payload: FeedbackIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fb = Feedback(
        reporter_user_id=user.id,
        kind=payload.kind,
        title=payload.title,
        description=payload.description,
        status=FeedbackStatus.OPEN,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return _to_out(fb, user)


@router.get("", response_model=list[FeedbackOut])
def list_feedback(
    kind: Optional[FeedbackKind] = Query(None),
    fb_status: Optional[FeedbackStatus] = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Feedback)
    if user.role != Role.ADMIN:
        q = q.filter(Feedback.reporter_user_id == user.id)
    if kind is not None:
        q = q.filter(Feedback.kind == kind)
    if fb_status is not None:
        q = q.filter(Feedback.status == fb_status)
    rows = q.order_by(Feedback.created_at.desc()).all()

    # Reporter-Daten auflösen
    reporter_ids = {r.reporter_user_id for r in rows if r.reporter_user_id is not None}
    reporters: dict[int, User] = {}
    if reporter_ids:
        users = db.query(User).filter(User.id.in_(reporter_ids)).all()
        reporters = {u.id: u for u in users}

    return [_to_out(r, reporters.get(r.reporter_user_id) if r.reporter_user_id else None)
            for r in rows]


@router.patch("/{feedback_id}", response_model=FeedbackOut)
def update_feedback(
    feedback_id: int,
    payload: FeedbackUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Nur Admin darf Feedback bearbeiten.")
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if fb is None:
        raise HTTPException(status_code=404, detail="Feedback nicht gefunden.")

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] is not None:
        new_status = updates["status"]
        # decided_at/by setzen, sobald aus open/in_progress in eine Endform übergeht
        if new_status in (FeedbackStatus.DONE, FeedbackStatus.REJECTED, FeedbackStatus.DUPLICATE):
            fb.decided_at = datetime.utcnow()
            fb.decided_by = user.id
        else:
            fb.decided_at = None
            fb.decided_by = None
        fb.status = new_status
    if "admin_response" in updates:
        fb.admin_response = updates["admin_response"]
    db.commit()
    db.refresh(fb)

    reporter = db.query(User).filter(User.id == fb.reporter_user_id).first() \
        if fb.reporter_user_id else None
    return _to_out(fb, reporter)


@router.delete("/{feedback_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feedback(
    feedback_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if fb is None:
        raise HTTPException(status_code=404, detail="Feedback nicht gefunden.")
    is_admin = user.role == Role.ADMIN
    is_own_open = fb.reporter_user_id == user.id and fb.status == FeedbackStatus.OPEN
    if not (is_admin or is_own_open):
        raise HTTPException(status_code=403, detail="Kein Zugriff.")
    db.delete(fb)
    db.commit()
