"""feedback-Tabelle für Bugs / Ideen / Verbesserungen.

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    feedback_kind = sa.Enum("bug", "idea", "improvement", name="feedback_kind")
    feedback_status = sa.Enum(
        "open", "in_progress", "done", "rejected", "duplicate",
        name="feedback_status",
    )
    feedback_kind.create(op.get_bind(), checkfirst=True)
    feedback_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "reporter_user_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", feedback_kind, nullable=False),
        sa.Column("status", feedback_status, nullable=False, server_default="open"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("admin_response", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime, nullable=True),
        sa.Column(
            "decided_by", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_feedback_status", "feedback", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_feedback_status", table_name="feedback")
    op.drop_table("feedback")
    sa.Enum(name="feedback_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="feedback_kind").drop(op.get_bind(), checkfirst=True)
