"""ORM models."""
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum as SAEnum, Float, ForeignKey,
    Integer, JSON, String, Text,
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

    entries = relationship("TimeEntry", back_populates="user", cascade="all, delete-orphan")
    supervisor = relationship("User", remote_side=[id], backref="reports")

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


class AuditAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    reminder_no_entry = Column(Boolean, default=True, nullable=False)
    reminder_remaining_vacation = Column(Boolean, default=True, nullable=False)
    vacation_decided = Column(Boolean, default=True, nullable=False)
    incoming_vacation_request = Column(Boolean, default=True, nullable=False)
    incoming_sick_note = Column(Boolean, default=True, nullable=False)
    month_complete = Column(Boolean, default=True, nullable=False)


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
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    start_at = Column(DateTime, nullable=False, index=True)
    end_at = Column(DateTime, nullable=True)            # NULL = laufend
    break_minutes = Column(Integer, default=0, nullable=False)

    project = Column(String(128))
    note = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="entries")
