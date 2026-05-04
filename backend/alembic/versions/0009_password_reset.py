"""password_reset_token / password_reset_token_expires_at am User.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_reset_token", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_users_password_reset_token",
        "users",
        ["password_reset_token"],
        unique=True,
    )
    op.add_column(
        "users",
        sa.Column("password_reset_token_expires_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_reset_token_expires_at")
    op.drop_index("ix_users_password_reset_token", table_name="users")
    op.drop_column("users", "password_reset_token")
