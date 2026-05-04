"""ORM models."""
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum as SAEnum, Float, ForeignKey,
    Integer, String, Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


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
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(128))
    role = Column(SAEnum(Role, name="user_role"), nullable=False, default=Role.EMPLOYEE)
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Abrechnungsmodell
    billing_mode = Column(
        SAEnum(BillingMode, name="billing_mode"),
        default=BillingMode.SALARY,
        nullable=False,
    )
    hourly_rate_eur = Column(Float, default=0.0, nullable=False)
    monthly_target_hours = Column(Float, default=160.0, nullable=False)

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
    federal_state = Column(SAEnum(FederalState, name="federal_state"), nullable=True)
    weekly_hours = Column(Float, nullable=True)
    annual_vacation_days = Column(Float, nullable=True)
    initial_overtime_hours = Column(Float, default=0.0, nullable=False)
    initial_remaining_vacation = Column(Float, default=0.0, nullable=False)

    # Lifecycle
    offboarded_at = Column(DateTime, nullable=True)

    entries = relationship("TimeEntry", back_populates="user", cascade="all, delete-orphan")
    supervisor = relationship("User", remote_side=[id], backref="reports")


class AuditAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(SAEnum(AuditAction, name="audit_action"), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(Integer, nullable=False)
    before = Column(Text, nullable=True)  # JSON-encoded
    after = Column(Text, nullable=True)
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
