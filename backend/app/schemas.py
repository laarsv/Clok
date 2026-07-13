"""Pydantic schemas for request/response validation."""
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models import (
    AbsenceStatus, AbsenceType, BillingMode, CompanySizeBucket, FederalState,
    FeedbackKind, FeedbackStatus, OnboardingStatus, Role,
)


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
    onboarding_status: OnboardingStatus
    company_id: Optional[int] = None

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

    # Firma & HR-Kontakt (nur Arbeitgeber-Profile)
    company_name: Optional[str] = None
    company_address_line1: Optional[str] = None
    company_address_line2: Optional[str] = None
    company_postal_code: Optional[str] = None
    company_city: Optional[str] = None
    company_country: Optional[str] = None
    hr_contact_name: Optional[str] = None
    hr_contact_email: Optional[str] = None
    hr_contact_phone: Optional[str] = None

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
    # Firma & HR (nur sinnvoll für Arbeitgeber-User)
    company_name: Optional[str] = None
    company_address_line1: Optional[str] = None
    company_address_line2: Optional[str] = None
    company_postal_code: Optional[str] = None
    company_city: Optional[str] = None
    company_country: Optional[str] = None
    hr_contact_name: Optional[str] = None
    hr_contact_email: Optional[EmailStr] = None
    hr_contact_phone: Optional[str] = None


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


# ---------- Projects ----------

class ProjectIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    client: Optional[str] = None
    color: Optional[str] = None
    hours_budget: Optional[float] = Field(None, ge=0)
    archived: Optional[bool] = None


class ProjectOut(BaseModel):
    id: int
    owner_user_id: int
    name: str
    client: Optional[str] = None
    color: Optional[str] = None
    hours_budget: Optional[float] = None
    archived: bool
    created_at: datetime


class ProjectReportEmployee(BaseModel):
    user_id: int
    name: str
    hours: float


class ProjectReportRow(BaseModel):
    project_id: int
    name: str
    client: Optional[str] = None
    color: Optional[str] = None
    hours_budget: Optional[float] = None
    total_hours: float
    by_employee: list[ProjectReportEmployee] = []


class ProjectReportOut(BaseModel):
    start: date
    end: date
    rows: list[ProjectReportRow] = []
    no_project_hours: float = 0.0


# ---------- Time entries ----------

class TimeEntryIn(BaseModel):
    start_at: datetime
    end_at: Optional[datetime] = None
    break_minutes: int = Field(0, ge=0, le=480)
    project_id: Optional[int] = None
    note: Optional[str] = None


class TimeEntryOut(TimeEntryIn):
    id: int
    user_id: int
    project: Optional[str] = None  # aufgelöster Projektname (für die Anzeige)
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
    # Gutgeschriebene Stunden (Lohnfortzahlung) bei genehmigtem bezahltem
    # Urlaub/Krankheit; 0 bei unbezahlt/pending/Nicht-Salary.
    paid_hours: float = 0.0

    class Config:
        from_attributes = True


# ---------- Employer-Onboarding (Wizard) ----------

class InvitePreviewOut(BaseModel):
    """Antwort auf GET /api/onboarding/invite/{token}. Vorausgefüllte
    Felder, die der Wizard beim Step 1 vorbelegt. Token-Status (ok /
    abgelaufen / zurückgezogen / bereits eingelöst) wird über die HTTP-
    Statuscodes signalisiert (siehe docs/onboarding-flow.md §4.2)."""
    email: EmailStr
    full_name: Optional[str] = None
    company_name: Optional[str] = None


class InviteAcceptIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9._-]{3,32}$")
    password: str = Field(min_length=12, max_length=72)
    full_name: str = Field(min_length=1, max_length=128)
    accept_terms: bool


class InviteAcceptOut(BaseModel):
    user: UserOut
    token: Token


class OnboardingStatusOut(BaseModel):
    """GET /api/onboarding/status – eigener Status. `next_step` ist
    der Frontend-Pfad, auf den geroutet werden soll."""
    onboarding_status: OnboardingStatus
    next_step: Optional[str] = None  # z. B. "/onboarding/company", oder None bei active


class OnboardingCompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address_street: Optional[str] = Field(None, max_length=255)
    address_zip: Optional[str] = Field(None, max_length=10)
    address_city: Optional[str] = Field(None, max_length=128)
    address_country: str = Field("DE", max_length=2)
    vat_id: Optional[str] = Field(None, max_length=32)
    bundesland: FederalState
    industry: Optional[str] = Field(None, max_length=128)
    employee_count_bucket: CompanySizeBucket


class OnboardingDefaultsIn(BaseModel):
    default_weekly_hours: float = Field(ge=0, le=80)
    default_vacation_days: float = Field(ge=0, le=60)
    default_bundesland: FederalState
    default_billing_mode: BillingMode


# ---------- Employer-Invites ----------

class EmployerInviteIn(BaseModel):
    email: EmailStr
    full_name: Optional[str] = Field(None, max_length=128)
    company_name: Optional[str] = Field(None, max_length=255)


class EmployerInviteOut(BaseModel):
    """Listendarstellung. `status` ist aus den Timestamps abgeleitet."""
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    status: Literal["pending", "accepted", "expired", "revoked"]
    expires_at: datetime
    created_at: datetime
    created_by_admin_id: Optional[int] = None
    accepted_at: Optional[datetime] = None
    accepted_by_user_id: Optional[int] = None
    revoked_at: Optional[datetime] = None
    revoked_by_admin_id: Optional[int] = None
    last_resent_at: Optional[datetime] = None
    resent_by_admin_id: Optional[int] = None


class EmployerInviteCreatedOut(BaseModel):
    """Antwort auf POST /api/admin/employer-invites. Klartext-Token wird
    NUR hier zurückgegeben und nirgends sonst nochmal preisgegeben."""
    invite: EmployerInviteOut
    plaintext_token: str
    onboarding_url: str


class EmployerInviteResendOut(BaseModel):
    """Antwort auf POST /api/admin/employer-invites/{id}/resend.

    Resend rotiert IMMER den Token (alter Klartext-Link wird damit
    ungültig) und verlängert die Frist; der neue Klartext-Link
    erreicht den Empfänger ausschließlich per Mail. In der Response
    wird kein Klartext zurückgegeben – das verhindert, dass ein zweiter
    Admin per Resend an einen Onboarding-Link kommt, den nur der
    erstellende Admin im Erstellungsmoment gesehen hat.

    `expires_extended` zeigt an, ob die Ablauffrist neu gesetzt wurde
    (true) oder nur die Mail rausgegangen ist – aktuell immer true,
    bleibt aber als Feld für Tooling/Audit erhalten."""
    invite: EmployerInviteOut
    expires_extended: bool


# ---------- Feedback ----------

class FeedbackIn(BaseModel):
    kind: FeedbackKind
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5, max_length=5000)


class FeedbackUpdate(BaseModel):
    """Admin-Update: Status setzen und/oder antworten."""
    status: Optional[FeedbackStatus] = None
    admin_response: Optional[str] = Field(None, max_length=5000)


class FeedbackOut(BaseModel):
    id: int
    reporter_user_id: Optional[int] = None
    reporter_username: Optional[str] = None
    reporter_full_name: Optional[str] = None
    reporter_role: Optional[Role] = None
    kind: FeedbackKind
    status: FeedbackStatus
    title: str
    description: str
    admin_response: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    decided_at: Optional[datetime] = None
    decided_by: Optional[int] = None


# ---------- Stats ----------

class PeriodSummary(BaseModel):
    period: str            # "day" | "week" | "month"
    start: datetime
    end: datetime
    net_hours: float
    target_hours: Optional[float] = None  # nur bei salary
    remaining_hours: Optional[float] = None
    billable_eur: Optional[float] = None  # nur bei hourly


class BalanceOut(BaseModel):
    """Saldo per Stichtag (Default: heute). Saldo = Ist bis Stichtag minus
    Soll bis Stichtag (ab hire_date) plus initial_overtime und
    BalanceAdjustments. Liefert für hourly-User 0.0."""
    balance_hours: float
    as_of: date
    actual_hours_to_date: float
    target_hours_to_date: float
    # Lohnfortzahlungs-Stunden aus genehmigtem bezahltem Urlaub/Krankheit bis
    # Stichtag – zählen wie gearbeitet, für die transparente Aufschlüsselung.
    absence_credit_hours: float = 0.0


class PeriodKpiOut(BaseModel):
    """KPIs für einen frei wählbaren Zeitraum (Dashboard-Filter)."""
    start: date
    end: date  # inclusive
    actual_hours: float
    target_hours: float
    vacation_days: int
    sick_days: int
    other_absence_days: int


class MonthSummary(BaseModel):
    """Ein Monatsslot in der Jahresübersicht. Wird in stats.year_overview
    pro Kalendermonat befüllt – nur für Monate, deren Beginn bereits
    erreicht ist."""
    month: int                   # 1..12
    actual_hours: float
    target_hours: float          # 0.0 bei billing_mode=hourly
    # Saldo zum Monatsende. None für den laufenden Monat – wir sind
    # nicht am Monatsende, eine Hochrechnung wäre genauso irreführend
    # wie das frühere balance_at_year_end.
    balance_at_end: Optional[float] = None
    absence_credit_hours: float = 0.0  # Lohnfortzahlung (Urlaub/Krankheit) im Monat
    vacation_days: int
    sick_days: int
    other_absence_days: int      # unpaid + special + parental + training


class YearOverview(BaseModel):
    """Antwort von GET /api/stats/year-overview.

    `months` enthält nur Monate, deren 1. bereits erreicht ist – keine
    Zukunftsmonate. Es gibt bewusst kein `balance_at_year_end`-Feld:
    eine Hochrechnung des Jahresend-Saldos aus aktuellem Ist gegen
    Jahres-Soll wäre für ein laufendes Jahr irreführend (Bug-Fix
    2026-05-07). Wer den aktuellen Saldo will, fragt
    `GET /api/stats/balance` ab."""
    year: int
    months: list[MonthSummary]
    total_actual: float
    total_target: float
    balance_at_year_start: float
    vacation_used: int
    vacation_remaining: float
    sick_total: int
