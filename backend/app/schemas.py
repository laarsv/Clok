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
    work_days: Optional[list[str]] = None
    offboarded_at: Optional[datetime] = None
    onboarding_pending: bool = False

    class Config:
        from_attributes = True


class EmployeeCreate(BaseModel):
    """Arbeitgeber/Admin-Onboarding-Payload.

    Bewusst reduziert auf Daten, die *Arbeitgeber* setzen darf
    (vertraglich/abrechnungsrelevant). Persönliche Daten (Adresse,
    Geburtsdatum, IBAN, …) trägt der Mitarbeiter beim Self-Service-
    Onboarding selbst nach. Kein Passwort hier – ein Onboarding-Token
    geht per Mail an den Mitarbeiter, der dort sein Passwort selbst
    setzt.
    """
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    role: Role = Role.EMPLOYEE
    supervisor_id: Optional[int] = None  # bei Admin: explizit setzbar
    billing_mode: BillingMode = BillingMode.SALARY
    hourly_rate_eur: float = 0.0
    weekly_hours: Optional[float] = None
    work_days: list[str] = Field(default_factory=lambda: ["mon", "tue", "wed", "thu", "fri"])
    annual_vacation_days: Optional[float] = None
    initial_overtime_hours: float = 0.0
    initial_remaining_vacation: float = 0.0
    federal_state: Optional[FederalState] = None
    hire_date: Optional[date] = None


class OnboardingPreview(BaseModel):
    """Was der Mitarbeiter beim Klick auf den Invite-Link sieht."""
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    employer_name: Optional[str] = None


class OnboardingComplete(BaseModel):
    """Self-Service: Mitarbeiter setzt Passwort und persönliche Daten."""
    password: str = Field(min_length=8)
    full_name: Optional[str] = None
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


class UserUpdate(BaseModel):
    """Allgemeines Update – wer was darf, entscheidet die Permission-Layer (Commit 4)."""
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    supervisor_id: Optional[int] = None  # nur Admin darf das ändern
    billing_mode: Optional[BillingMode] = None
    hourly_rate_eur: Optional[float] = Field(None, ge=0)
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
    work_days: Optional[list[str]] = None
    annual_vacation_days: Optional[float] = Field(None, ge=0, le=60)
    initial_overtime_hours: Optional[float] = None
    initial_remaining_vacation: Optional[float] = Field(None, ge=0)


# ---------- Balance Adjustments ----------

class BalanceAdjustmentIn(BaseModel):
    effective_date: date
    hours: float
    reason: str = Field(min_length=3, max_length=500)


class BalanceAdjustmentOut(BaseModel):
    id: int
    user_id: int
    effective_date: date
    hours: float
    reason: str
    created_at: datetime
    created_by: Optional[int] = None

    class Config:
        from_attributes = True


# ---------- Employment Terms ----------

class TermsIn(BaseModel):
    """Neuer Vertragsabschnitt. Felder, die nicht angegeben sind,
    werden vom aktuell gültigen Vertrag übernommen."""
    valid_from: date
    billing_mode: Optional[BillingMode] = None
    hourly_rate_eur: Optional[float] = Field(None, ge=0)
    weekly_hours: Optional[float] = Field(None, ge=0, le=80)
    work_days: Optional[list[str]] = None
    annual_vacation_days: Optional[float] = Field(None, ge=0, le=60)
    note: Optional[str] = None


class TermsPatch(BaseModel):
    """Korrektur eines bestehenden Eintrags."""
    valid_from: Optional[date] = None
    billing_mode: Optional[BillingMode] = None
    hourly_rate_eur: Optional[float] = Field(None, ge=0)
    weekly_hours: Optional[float] = Field(None, ge=0, le=80)
    work_days: Optional[list[str]] = None
    annual_vacation_days: Optional[float] = Field(None, ge=0, le=60)
    note: Optional[str] = None


class TermsOut(BaseModel):
    id: int
    user_id: int
    valid_from: date
    billing_mode: BillingMode
    hourly_rate_eur: float
    weekly_hours: Optional[float] = None
    work_days: Optional[list[str]] = None
    annual_vacation_days: Optional[float] = None
    note: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None

    class Config:
        from_attributes = True


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


# ---------- Absences ----------

class AbsenceIn(BaseModel):
    type: AbsenceType
    start_date: date
    end_date: date
    note: Optional[str] = None
    user_id: Optional[int] = None  # nur relevant, wenn Arbeitgeber für MA krank meldet


class AbsenceDecision(BaseModel):
    note: Optional[str] = None


class AbsenceUpdate(BaseModel):
    """Allgemeine Bearbeitung (Datum, Notiz, Typ).
    Status-Übergänge laufen weiter über approve/reject."""
    type: Optional[AbsenceType] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
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


class MonthSummary(BaseModel):
    """Ein Monatsslot in der Jahresübersicht. Wird in stats.year_overview
    pro Kalendermonat befüllt."""
    month: int                   # 1..12
    actual_hours: float
    target_hours: float          # 0.0 bei billing_mode=hourly
    balance_at_end: float        # kumulierter Saldo zum Monatsende
    vacation_days: int
    sick_days: int
    other_absence_days: int      # unpaid + special + parental + training


class YearOverview(BaseModel):
    """Antwort von GET /api/stats/year-overview."""
    year: int
    months: list[MonthSummary]
    total_actual: float
    total_target: float
    balance_at_year_start: float
    balance_at_year_end: float
    vacation_used: int
    vacation_remaining: float
    sick_total: int
