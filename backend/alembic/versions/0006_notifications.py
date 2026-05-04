"""Notification-Settings + Notification-Log.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SETTING_FIELDS = (
    "reminder_no_entry",
    "reminder_remaining_vacation",
    "vacation_decided",
    "incoming_vacation_request",
    "incoming_sick_note",
    "month_complete",
)


def upgrade() -> None:
    cols = [
        sa.Column("user_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    ]
    for f in SETTING_FIELDS:
        cols.append(sa.Column(f, sa.Boolean, nullable=False, server_default=sa.true()))
    op.create_table("notification_settings", *cols)

    op.create_table(
        "notification_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("period_key", sa.String(32), nullable=False),
        sa.Column("sent_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "kind", "period_key",
                            name="uq_notification_log_user_kind_period"),
    )


def downgrade() -> None:
    op.drop_table("notification_log")
    op.drop_table("notification_settings")
