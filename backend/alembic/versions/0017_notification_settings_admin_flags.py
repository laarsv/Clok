"""Notification-Toggles für Admin-Mails (Onboarding + Invite-Digest).

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_FLAGS = (
    "admin_employer_onboarding_started",
    "admin_employer_onboarding_completed",
    "admin_employer_invite_expired_digest",
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
