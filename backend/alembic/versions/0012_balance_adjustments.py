"""balance_adjustments – manuelle Saldo-Korrekturen mit Begründung.

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "balance_adjustments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("hours", sa.Float, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column(
            "created_by", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_balance_adjustments_user_date",
        "balance_adjustments",
        ["user_id", "effective_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_balance_adjustments_user_date", table_name="balance_adjustments")
    op.drop_table("balance_adjustments")
