"""ORM models."""
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SAEnum, Float, ForeignKey,
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

    entries = relationship("TimeEntry", back_populates="user", cascade="all, delete-orphan")
    supervisor = relationship("User", remote_side=[id], backref="reports")


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
