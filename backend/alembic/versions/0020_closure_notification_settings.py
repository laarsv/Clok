"""Notification-Toggles für den Monatsabschluss-Workflow (Einreichen/Entscheidung).

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_FLAGS = (
    "month_submitted",
    "month_closure_decided",
)


def upgrade() -> None:
    for flag in _NEW_FLAGS:
        op.add_column(
            "notification_settings",
            sa.Column(flag, sa.Boolean, nullable=False, server_default=sa.true()),
        )


def downgrade() -> None:
    for flag in reversed(_NEW_FLAGS):
        op.drop_column("notification_settings", flag)
