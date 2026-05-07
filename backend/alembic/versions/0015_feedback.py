"""feedback-Tabelle für Bugs / Ideen / Verbesserungen.

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FEEDBACK_KIND_VALUES = ("bug", "idea", "improvement")
_FEEDBACK_STATUS_VALUES = ("open", "in_progress", "done", "rejected", "duplicate")


def upgrade() -> None:
    bind = op.get_bind()

    # Enum-Typen einmal explizit anlegen. Wichtig: NEUE postgresql.ENUM-
    # Instanzen für die Spalten verwenden (mit create_type=False), nicht die
    # gleichen Objekte wie hier oben – sonst registriert SQLAlchemy einen
    # before_create-Hook auf der Tabelle, der den Typ nochmal anlegen will.
    postgresql.ENUM(*_FEEDBACK_KIND_VALUES, name="feedback_kind").create(
        bind, checkfirst=True,
    )
    postgresql.ENUM(*_FEEDBACK_STATUS_VALUES, name="feedback_status").create(
        bind, checkfirst=True,
    )

    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "reporter_user_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "kind",
            postgresql.ENUM(*_FEEDBACK_KIND_VALUES, name="feedback_kind",
                            create_type=False),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*_FEEDBACK_STATUS_VALUES, name="feedback_status",
                            create_type=False),
            nullable=False, server_default="open",
        ),
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
    postgresql.ENUM(name="feedback_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="feedback_kind").drop(op.get_bind(), checkfirst=True)
