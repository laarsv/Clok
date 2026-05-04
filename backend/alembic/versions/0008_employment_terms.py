"""employment_terms: zeitlich versionierte Vertragsdaten pro User.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-04
"""
from datetime import date
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    billing_mode_ref = postgresql.ENUM(name="billing_mode", create_type=False)

    op.create_table(
        "employment_terms",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("valid_from", sa.Date, nullable=False),
        sa.Column("billing_mode", billing_mode_ref, nullable=False),
        sa.Column("hourly_rate_eur", sa.Float, nullable=False, server_default="0"),
        sa.Column("monthly_target_hours", sa.Float, nullable=False, server_default="160"),
        sa.Column("weekly_hours", sa.Float, nullable=True),
        sa.Column("work_days", sa.JSON, nullable=True),
        sa.Column("annual_vacation_days", sa.Float, nullable=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column(
            "created_by", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_employment_terms_user_valid",
        "employment_terms",
        ["user_id", "valid_from"],
    )
    op.create_unique_constraint(
        "uq_employment_terms_user_valid_from",
        "employment_terms",
        ["user_id", "valid_from"],
    )

    # Bestehende User mit Rolle 'employee' bekommen einen initialen Vertrag.
    op.execute(
        """
        INSERT INTO employment_terms (
            user_id, valid_from, billing_mode, hourly_rate_eur,
            monthly_target_hours, weekly_hours, work_days,
            annual_vacation_days, note
        )
        SELECT
            id,
            COALESCE(hire_date, created_at::date, DATE '2020-01-01'),
            billing_mode,
            hourly_rate_eur,
            monthly_target_hours,
            weekly_hours,
            work_days,
            annual_vacation_days,
            'Initialer Vertrag (Migration 0008)'
        FROM users
        WHERE role = 'employee'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_employment_terms_user_valid", table_name="employment_terms")
    op.drop_constraint(
        "uq_employment_terms_user_valid_from", "employment_terms", type_="unique",
    )
    op.drop_table("employment_terms")
