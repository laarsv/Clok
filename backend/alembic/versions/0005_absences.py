"""Absences-Tabelle (Urlaub, Krankheit, unbezahlt).

Revision ID: 0005
Revises: 0004 (heads: 0004)
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sa.Enum("vacation", "sick", "unpaid", name="absence_type").create(
        op.get_bind(), checkfirst=True,
    )
    sa.Enum("pending", "approved", "rejected", name="absence_status").create(
        op.get_bind(), checkfirst=True,
    )
    absence_type = sa.Enum(
        "vacation", "sick", "unpaid", name="absence_type", create_type=False,
    )
    absence_status = sa.Enum(
        "pending", "approved", "rejected", name="absence_status", create_type=False,
    )

    op.create_table(
        "absences",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", absence_type, nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("status", absence_status, nullable=False, server_default="pending"),
        sa.Column("requested_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime, nullable=True),
        sa.Column("decided_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_absences_user_start", "absences", ["user_id", "start_date"])


def downgrade() -> None:
    op.drop_index("ix_absences_user_start", table_name="absences")
    op.drop_table("absences")
    sa.Enum(name="absence_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="absence_type").drop(op.get_bind(), checkfirst=True)
