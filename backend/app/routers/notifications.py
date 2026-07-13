"""Notification-Settings: pro User abschaltbar pro Mail-Typ."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import NotificationSettings, User
from app.permissions import require_active_user

router = APIRouter(prefix="/api/notification-settings", tags=["notifications"])


class NotificationSettingsOut(BaseModel):
    reminder_no_entry: bool
    reminder_remaining_vacation: bool
    vacation_decided: bool
    incoming_vacation_request: bool
    incoming_sick_note: bool
    month_complete: bool
    month_submitted: bool
    month_closure_decided: bool

    class Config:
        from_attributes = True


class NotificationSettingsUpdate(BaseModel):
    reminder_no_entry: bool | None = None
    reminder_remaining_vacation: bool | None = None
    vacation_decided: bool | None = None
    incoming_vacation_request: bool | None = None
    incoming_sick_note: bool | None = None
    month_complete: bool | None = None
    month_submitted: bool | None = None
    month_closure_decided: bool | None = None


def _ensure(db: Session, user_id: int) -> NotificationSettings:
    s = db.query(NotificationSettings).filter(NotificationSettings.user_id == user_id).first()
    if s is None:
        s = NotificationSettings(user_id=user_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("", response_model=NotificationSettingsOut)
def get_settings(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    return NotificationSettingsOut.model_validate(_ensure(db, user.id))


@router.patch("", response_model=NotificationSettingsOut)
def update_settings(
    payload: NotificationSettingsUpdate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    s = _ensure(db, user.id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return NotificationSettingsOut.model_validate(s)
