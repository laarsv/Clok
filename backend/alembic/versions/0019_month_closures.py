"""Monatsabschluss (month_closures): Einreichen/Freigeben pro MA & Monat.

Revision ID: 0019
Revises: 0018
Create Date: 2026-07-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "month_closures",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("status",
                  sa.Enum("submitted", "approved", name="month_closure_status"),
                  nullable=False),
        sa.Column("submitted_at", sa.DateTime, nullable=True),
        sa.Column("submitted_by", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime, nullable=True),
        sa.Column("decided_by", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "year", "month", name="uq_month_closure"),
    )


def downgrade() -> None:
    op.drop_table("month_closures")
    sa.Enum(name="month_closure_status").drop(op.get_bind(), checkfirst=True)
