"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models import BillingMode, Role


# ---------- Auth ----------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    username: str
    password: str


# ---------- User ----------

class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    role: Role
    supervisor_id: Optional[int] = None
    billing_mode: BillingMode
    hourly_rate_eur: float
    monthly_target_hours: float

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    billing_mode: Optional[BillingMode] = None
    hourly_rate_eur: Optional[float] = Field(None, ge=0)
    monthly_target_hours: Optional[float] = Field(None, ge=0)


# ---------- Time entries ----------

class TimeEntryIn(BaseModel):
    start_at: datetime
    end_at: Optional[datetime] = None
    break_minutes: int = Field(0, ge=0, le=480)
    project: Optional[str] = None
    note: Optional[str] = None


class TimeEntryOut(TimeEntryIn):
    id: int
    user_id: int
    net_hours: float
    gross_hours: float

    class Config:
        from_attributes = True


class ValidationIssueOut(BaseModel):
    severity: Literal["warning", "error"]
    code: str
    message: str


class TimeEntryCreateResponse(BaseModel):
    entry: TimeEntryOut
    issues: list[ValidationIssueOut] = []


# ---------- Stats ----------

class PeriodSummary(BaseModel):
    period: str            # "day" | "week" | "month"
    start: datetime
    end: datetime
    net_hours: float
    target_hours: Optional[float] = None  # nur bei salary
    remaining_hours: Optional[float] = None
    billable_eur: Optional[float] = None  # nur bei hourly
