"""monthly_target_hours raus – Soll wird dynamisch aus weekly_hours +
work_days + BL-Feiertagen pro Monat berechnet.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("users", "monthly_target_hours")
    op.drop_column("employment_terms", "monthly_target_hours")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("monthly_target_hours", sa.Float, nullable=False, server_default="160"),
    )
    op.add_column(
        "employment_terms",
        sa.Column("monthly_target_hours", sa.Float, nullable=False, server_default="160"),
    )
