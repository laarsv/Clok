"""Pydantic schemas for request/response validation."""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models import AbsenceStatus, AbsenceType, BillingMode, FederalState, Role


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

    # Stammdaten
    date_of_birth: Optional[date] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: str = "DE"
    social_security_number: Optional[str] = None
    iban: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None

    # Beschäftigung
    hire_date: Optional[date] = None
    federal_state: Optional[FederalState] = None
    weekly_hours: Optional[float] = None
    annual_vacation_days: Optional[float] = None
    initial_overtime_hours: float = 0.0
    initial_remaining_vacation: float = 0.0
    offboarded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Allgemeines Update – wer was darf, entscheidet die Permission-Layer (Commit 4)."""
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    billing_mode: Optional[BillingMode] = None
    hourly_rate_eur: Optional[float] = Field(None, ge=0)
    monthly_target_hours: Optional[float] = Field(None, ge=0)
    date_of_birth: Optional[date] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    social_security_number: Optional[str] = None
    iban: Optional[str] = None
    phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    hire_date: Optional[date] = None
    federal_state: Optional[FederalState] = None
    weekly_hours: Optional[float] = Field(None, ge=0, le=80)
    annual_vacation_days: Optional[float] = Field(None, ge=0, le=60)
    initial_overtime_hours: Optional[float] = None
    initial_remaining_vacation: Optional[float] = Field(None, ge=0)


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

# ---------- Absences ----------

class AbsenceIn(BaseModel):
    type: AbsenceType
    start_date: date
    end_date: date
    note: Optional[str] = None
    user_id: Optional[int] = None  # nur relevant, wenn Arbeitgeber für MA krank meldet


class AbsenceDecision(BaseModel):
    note: Optional[str] = None


class AbsenceOut(BaseModel):
    id: int
    user_id: int
    type: AbsenceType
    start_date: date
    end_date: date
    status: AbsenceStatus
    requested_at: datetime
    decided_at: Optional[datetime] = None
    decided_by: Optional[int] = None
    note: Optional[str] = None

    class Config:
        from_attributes = True


# ---------- Stats ----------

class PeriodSummary(BaseModel):
    period: str            # "day" | "week" | "month"
    start: datetime
    end: datetime
    net_hours: float
    target_hours: Optional[float] = None  # nur bei salary
    remaining_hours: Optional[float] = None
    billable_eur: Optional[float] = None  # nur bei hourly
