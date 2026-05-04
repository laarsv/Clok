"""work_days, Onboarding-Token, password_hash nullable.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_WORK_DAYS = '["mon","tue","wed","thu","fri"]'


def upgrade() -> None:
    op.add_column("users", sa.Column("work_days", sa.JSON, nullable=True))
    op.execute(f"UPDATE users SET work_days = '{DEFAULT_WORK_DAYS}'::json")

    op.add_column("users", sa.Column("onboarding_token", sa.String(64), nullable=True))
    op.create_index(
        "ix_users_onboarding_token", "users", ["onboarding_token"], unique=True,
    )
    op.add_column(
        "users",
        sa.Column("onboarding_token_expires_at", sa.DateTime, nullable=True),
    )

    op.alter_column("users", "password_hash", nullable=True)


def downgrade() -> None:
    op.alter_column("users", "password_hash", nullable=False)
    op.drop_column("users", "onboarding_token_expires_at")
    op.drop_index("ix_users_onboarding_token", table_name="users")
    op.drop_column("users", "onboarding_token")
    op.drop_column("users", "work_days")
