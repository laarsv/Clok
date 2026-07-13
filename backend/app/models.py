"""ORM models."""
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum as SAEnum, Float, ForeignKey,
    Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _enum_values(cls):
    """SQLAlchemy soll die Enum-VALUES an Postgres senden, nicht die NAMES.
    Sonst landet 'ADMIN' in der DB, die ENUM hat aber 'admin'."""
    return [e.value for e in cls]


class BillingMode(str, Enum):
    HOURLY = "hourly"   # stundenbasierte Abrechnung
    SALARY = "salary"   # Festgehalt mit Soll-Stunden


class Role(str, Enum):
    ADMIN = "admin"
    EMPLOYER = "employer"
    EMPLOYEE = "employee"


class OnboardingStatus(str, Enum):
    """Stand des Arbeitgeber-Onboarding-Wizards. Der Wert beschreibt
    jeweils den **nächsten offenen** Schritt; `active` heißt: fertig.
    Bestandsuser bekommen per Migration `active`."""
    STEP_1 = "onboarding_step_1"
    STEP_2 = "onboarding_step_2"
    STEP_3 = "onboarding_step_3"
    STEP_4 = "onboarding_step_4"
    STEP_5 = "onboarding_step_5"
    ACTIVE = "active"


class CompanySizeBucket(str, Enum):
    """Statistik-Bucket aus dem Onboarding (Schritt 2). Kein
    operativer Wert, nur Reporting."""
    ONE = "1"
    TWO_TO_FIVE = "2_5"
    SIX_TO_TEN = "6_10"
    ELEVEN_PLUS = "11_plus"


class FederalState(str, Enum):
    BW = "BW"  # Baden-Württemberg
    BY = "BY"  # Bayern
    BE = "BE"  # Berlin
    BB = "BB"  # Brandenburg
    HB = "HB"  # Bremen
    HH = "HH"  # Hamburg
    HE = "HE"  # Hessen
    MV = "MV"  # Mecklenburg-Vorpommern
    NI = "NI"  # Niedersachsen
    NW = "NW"  # Nordrhein-Westfalen
    RP = "RP"  # Rheinland-Pfalz
    SL = "SL"  # Saarland
    SN = "SN"  # Sachsen
    ST = "ST"  # Sachsen-Anhalt
    SH = "SH"  # Schleswig-Holstein
    TH = "TH"  # Thüringen


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)  # NULL bis Self-Service-Onboarding
    full_name = Column(String(128))
    role = Column(
        SAEnum(Role, name="user_role", values_callable=_enum_values),
        nullable=False, default=Role.EMPLOYEE,
    )
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Abrechnungsmodell
    billing_mode = Column(
        SAEnum(BillingMode, name="billing_mode", values_callable=_enum_values),
        default=BillingMode.SALARY,
        nullable=False,
    )
    hourly_rate_eur = Column(Float, default=0.0, nullable=False)

    # Stammdaten
    date_of_birth = Column(Date, nullable=True)
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    postal_code = Column(String(10), nullable=True)
    city = Column(String(128), nullable=True)
    country = Column(String(2), default="DE", nullable=False)
    social_security_number = Column(String(64), nullable=True)
    iban = Column(String(34), nullable=True)
    phone = Column(String(64), nullable=True)
    emergency_contact_name = Column(String(128), nullable=True)
    emergency_contact_phone = Column(String(64), nullable=True)

    # Firma (nur Arbeitgeber). Adresse, Name, HR-Ansprechpartner.
    # Bei Mitarbeitern bleiben diese Felder leer; Privatanschrift liegt
    # in den address_*-Feldern oben.
    company_name = Column(String(255), nullable=True)
    company_address_line1 = Column(String(255), nullable=True)
    company_address_line2 = Column(String(255), nullable=True)
    company_postal_code = Column(String(10), nullable=True)
    company_city = Column(String(128), nullable=True)
    company_country = Column(String(2), nullable=True)
    hr_contact_name = Column(String(128), nullable=True)
    hr_contact_email = Column(String(255), nullable=True)
    hr_contact_phone = Column(String(64), nullable=True)

    # Beschäftigung
    hire_date = Column(Date, nullable=True)
    federal_state = Column(
        SAEnum(FederalState, name="federal_state", values_callable=_enum_values),
        nullable=True,
    )
    weekly_hours = Column(Float, nullable=True)
    annual_vacation_days = Column(Float, nullable=True)
    initial_overtime_hours = Column(Float, default=0.0, nullable=False)
    initial_remaining_vacation = Column(Float, default=0.0, nullable=False)

    # Arbeitstage pro Woche (für Mindesturlaub und Werktag-Berechnung)
    work_days = Column(JSON, nullable=True)

    # Self-Service-Onboarding
    onboarding_token = Column(String(64), unique=True, nullable=True, index=True)
    onboarding_token_expires_at = Column(DateTime, nullable=True)

    # Passwort-Reset (separates Token, damit Onboarding-Token nicht „missbraucht" wird)
    password_reset_token = Column(String(64), unique=True, nullable=True, index=True)
    password_reset_token_expires_at = Column(DateTime, nullable=True)

    # Lifecycle
    offboarded_at = Column(DateTime, nullable=True)

    # Arbeitgeber-Onboarding (siehe docs/onboarding-flow.md). Bestandsuser
    # sind per Migration auf `active` gesetzt; ein neuer Arbeitgeber durch-
    # läuft die Steps 1–5 bevor `active` erreicht wird.
    onboarding_status = Column(
        SAEnum(OnboardingStatus, name="onboarding_status", values_callable=_enum_values),
        nullable=False,
        default=OnboardingStatus.ACTIVE,
    )
    email_verified_at = Column(DateTime, nullable=True)
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True,
    )

    entries = relationship("TimeEntry", back_populates="user", cascade="all, delete-orphan")
    supervisor = relationship("User", remote_side=[id], backref="reports")
    company = relationship("Company", foreign_keys=[company_id])

    @property
    def onboarding_pending(self) -> bool:
        return self.onboarding_token is not None


class EmploymentTerms(Base):
    """Zeitlich versionierte Vertragsdaten eines Mitarbeiters.

    Mehrere Einträge pro User möglich, getrennt durch `valid_from`.
    Der zum Stichtag d gültige Eintrag ist der mit dem größten
    valid_from <= d. Das Ende eines Eintrags ergibt sich implizit aus
    dem nächsten – kein eigenes valid_to-Feld, damit Lücken/Überlappungen
    nicht möglich sind.
    """
    __tablename__ = "employment_terms"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    valid_from = Column(Date, nullable=False)

    billing_mode = Column(SAEnum(BillingMode, name="billing_mode", values_callable=_enum_values), nullable=False)
    hourly_rate_eur = Column(Float, default=0.0, nullable=False)
    weekly_hours = Column(Float, nullable=True)
    work_days = Column(JSON, nullable=True)
    annual_vacation_days = Column(Float, nullable=True)

    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class AbsenceType(str, Enum):
    VACATION = "vacation"     # Erholungsurlaub
    SICK = "sick"             # Krankheit
    UNPAID = "unpaid"         # Unbezahlte Freistellung
    SPECIAL = "special"       # Bezahlter Sonderurlaub (Hochzeit, Umzug, Trauer, Kinderkrank …)
    PARENTAL = "parental"     # Elternzeit
    TRAINING = "training"     # Fortbildung / Schulung


class AbsenceStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Absence(Base):
    __tablename__ = "absences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(
        SAEnum(AbsenceType, name="absence_type", values_callable=_enum_values),
        nullable=False,
    )
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(
        SAEnum(AbsenceStatus, name="absence_status", values_callable=_enum_values),
        default=AbsenceStatus.PENDING,
        nullable=False,
    )
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Company(Base):
    """Arbeitgeber-Firma. Hängt an User.company_id. Hält Stammdaten der
    Firma und die Default-Werte, die beim Anlegen neuer Mitarbeiter als
    Vorbelegung dienen (im Mitarbeiter-Datensatz pro MA überschreibbar)."""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)

    address_street = Column(String(255), nullable=True)
    address_zip = Column(String(10), nullable=True)
    address_city = Column(String(128), nullable=True)
    address_country = Column(String(2), nullable=True, default="DE")
    vat_id = Column(String(32), nullable=True)
    bundesland = Column(
        SAEnum(FederalState, name="federal_state", values_callable=_enum_values),
        nullable=True,
    )
    industry = Column(String(128), nullable=True)
    employee_count_bucket = Column(
        SAEnum(CompanySizeBucket, name="company_size_bucket",
               values_callable=_enum_values),
        nullable=True,
    )

    default_weekly_hours = Column(Float, nullable=True)
    default_vacation_days = Column(Float, nullable=True)
    default_bundesland = Column(
        SAEnum(FederalState, name="federal_state", values_callable=_enum_values),
        nullable=True,
    )
    default_billing_mode = Column(
        SAEnum(BillingMode, name="billing_mode", values_callable=_enum_values),
        nullable=True,
    )

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )


class EmployerInvite(Base):
    """Token-basierter Invite, mit dem ein Admin einen neuen Arbeitgeber
    in den Wizard einlädt. Klartext-Token wird nur in der Create-Response
    zurückgegeben; in der DB liegt nur sein SHA-256-Hash. Status ergibt
    sich aus den Timestamps:

    - revoked_at IS NOT NULL  → revoked
    - accepted_at IS NOT NULL → accepted
    - expires_at < now()      → expired
    - sonst                   → pending
    """
    __tablename__ = "employer_invites"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False, index=True)
    full_name = Column(String(128), nullable=True)
    company_name = Column(String(255), nullable=True)

    # SHA-256 hex (64 chars), UNIQUE — Lookup ist deterministischer
    # Hash-Vergleich (kein Constant-Time-Loop nötig, weil ein 256-bit-
    # Random nicht ratebar ist).
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)

    created_by_admin_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    accepted_at = Column(DateTime, nullable=True)
    accepted_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    revoked_at = Column(DateTime, nullable=True)
    revoked_by_admin_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    last_resent_at = Column(DateTime, nullable=True)
    resent_by_admin_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    expired_digest_sent_at = Column(DateTime, nullable=True)


class FeedbackKind(str, Enum):
    BUG = "bug"                   # Fehler
    IDEA = "idea"                 # Neue Idee
    IMPROVEMENT = "improvement"   # Verbesserung


class FeedbackStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    REJECTED = "rejected"
    DUPLICATE = "duplicate"


class Feedback(Base):
    """User-Feedback (Bugs, Ideen, Verbesserungen). Sichtbar für Reporter
    selbst und für Admins. Admins können Status setzen und antworten."""
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True)
    reporter_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    kind = Column(
        SAEnum(FeedbackKind, name="feedback_kind", values_callable=_enum_values),
        nullable=False,
    )
    status = Column(
        SAEnum(FeedbackStatus, name="feedback_status", values_callable=_enum_values),
        default=FeedbackStatus.OPEN,
        nullable=False,
    )
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    admin_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class AuditAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class BalanceAdjustment(Base):
    """Manuelle Saldo-Korrektur mit Begründung. Wird auf den Saldo
    addiert, sobald `effective_date` <= Stichtag der Berechnung ist.
    Sinn: Auszahlungen Überstunden, Korrekturen aus Altsystem-Übernahme,
    Anpassungen bei Vertragsende, Abgeltungs-Buchungen."""
    __tablename__ = "balance_adjustments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    effective_date = Column(Date, nullable=False)
    hours = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    reminder_no_entry = Column(Boolean, default=True, nullable=False)
    reminder_remaining_vacation = Column(Boolean, default=True, nullable=False)
    vacation_decided = Column(Boolean, default=True, nullable=False)
    incoming_vacation_request = Column(Boolean, default=True, nullable=False)
    incoming_sick_note = Column(Boolean, default=True, nullable=False)
    month_complete = Column(Boolean, default=True, nullable=False)
    # Monatsabschluss-Workflow: AG bekommt Mail bei Einreichung, MA bei Entscheidung.
    month_submitted = Column(Boolean, default=True, nullable=False)
    month_closure_decided = Column(Boolean, default=True, nullable=False)
    # Admin-Mails rund ums Arbeitgeber-Onboarding (Toggles für jeden User
    # vorhanden, sinnvoll genutzt nur bei Admin-Rolle).
    admin_employer_onboarding_started = Column(Boolean, default=True, nullable=False)
    admin_employer_onboarding_completed = Column(Boolean, default=True, nullable=False)
    admin_employer_invite_expired_digest = Column(Boolean, default=True, nullable=False)


class NotificationLog(Base):
    __tablename__ = "notification_log"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(64), nullable=False)
    period_key = Column(String(32), nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(
        SAEnum(AuditAction, name="audit_action", values_callable=_enum_values),
        nullable=False,
    )
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(Integer, nullable=False)
    # Welcher Mitarbeiter ist von der Änderung betroffen? Erlaubt Filter pro
    # User im Audit-Viewer, ohne pro entity_type eine eigene Subquery zu fahren.
    subject_user_id = Column(Integer, nullable=True)
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Project(Base):
    """Vom Arbeitgeber verwaltetes Projekt. Mitarbeiter buchen Zeiteinträge
    darauf (Dropdown) und der Arbeitgeber wertet Stunden je Projekt aus.

    Besitz über `owner_user_id` = der Arbeitgeber (Role.EMPLOYER). Die
    auswählbaren Projekte eines Mitarbeiters sind die seines Vorgesetzten
    (`User.supervisor_id`). Archivierte Projekte (`archived_at`) fallen aus
    dem Dropdown, bleiben aber in Auswertungen erhalten."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    owner_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name = Column(String(128), nullable=False)
    client = Column(String(128), nullable=True)        # Kunde / Auftraggeber
    color = Column(String(16), nullable=True)          # Hex/Token zur Kennzeichnung
    hours_budget = Column(Float, nullable=True)        # geplantes Stundenkontingent
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        UniqueConstraint("owner_user_id", "name", name="uq_project_owner_name"),
    )


class MonthClosureStatus(str, Enum):
    SUBMITTED = "submitted"   # vom MA eingereicht
    APPROVED = "approved"     # vom AG freigegeben/gesperrt


class MonthClosure(Base):
    """Monatsabschluss pro (User, Jahr, Monat). Kein Datensatz = offen.
    `submitted` = vom MA eingereicht (für ihn selbst gesperrt), `approved` =
    vom AG freigegeben (für alle gesperrt, bis wieder geöffnet)."""
    __tablename__ = "month_closures"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    status = Column(
        SAEnum(MonthClosureStatus, name="month_closure_status", values_callable=_enum_values),
        nullable=False,
    )
    submitted_at = Column(DateTime, nullable=True)
    submitted_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", name="uq_month_closure"),
    )


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    start_at = Column(DateTime, nullable=False, index=True)
    end_at = Column(DateTime, nullable=True)            # NULL = laufend
    break_minutes = Column(Integer, default=0, nullable=False)

    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    note = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="entries")
    project_ref = relationship("Project")
