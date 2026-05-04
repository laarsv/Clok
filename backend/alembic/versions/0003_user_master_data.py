"""User-Stammdaten: Adresse, SV-Nr, IBAN, Telefon, Notfallkontakt, Beschäftigungsdaten.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FEDERAL_STATES = (
    "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
    "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
)


def upgrade() -> None:
    sa.Enum(*FEDERAL_STATES, name="federal_state").create(
        op.get_bind(), checkfirst=True,
    )
    federal_state = postgresql.ENUM(
        *FEDERAL_STATES, name="federal_state", create_type=False,
    )

    with op.batch_alter_table("users") as b:
        b.add_column(sa.Column("date_of_birth", sa.Date, nullable=True))
        b.add_column(sa.Column("address_line1", sa.String(255), nullable=True))
        b.add_column(sa.Column("address_line2", sa.String(255), nullable=True))
        b.add_column(sa.Column("postal_code", sa.String(10), nullable=True))
        b.add_column(sa.Column("city", sa.String(128), nullable=True))
        b.add_column(sa.Column("country", sa.String(2), nullable=False, server_default="DE"))
        b.add_column(sa.Column("social_security_number", sa.String(64), nullable=True))
        b.add_column(sa.Column("iban", sa.String(34), nullable=True))
        b.add_column(sa.Column("phone", sa.String(64), nullable=True))
        b.add_column(sa.Column("emergency_contact_name", sa.String(128), nullable=True))
        b.add_column(sa.Column("emergency_contact_phone", sa.String(64), nullable=True))
        b.add_column(sa.Column("hire_date", sa.Date, nullable=True))
        b.add_column(sa.Column("federal_state", federal_state, nullable=True))
        b.add_column(sa.Column("weekly_hours", sa.Float, nullable=True))
        b.add_column(sa.Column("annual_vacation_days", sa.Float, nullable=True))
        b.add_column(sa.Column("initial_overtime_hours", sa.Float, nullable=False, server_default="0"))
        b.add_column(sa.Column("initial_remaining_vacation", sa.Float, nullable=False, server_default="0"))
        b.add_column(sa.Column("offboarded_at", sa.DateTime, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as b:
        for col in (
            "offboarded_at", "initial_remaining_vacation", "initial_overtime_hours",
            "annual_vacation_days", "weekly_hours", "federal_state", "hire_date",
            "emergency_contact_phone", "emergency_contact_name", "phone", "iban",
            "social_security_number", "country", "city", "postal_code",
            "address_line2", "address_line1", "date_of_birth",
        ):
            b.drop_column(col)
    sa.Enum(name="federal_state").drop(op.get_bind(), checkfirst=True)
