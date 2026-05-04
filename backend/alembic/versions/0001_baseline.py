"""Baseline: bestehendes Schema (users, time_entries) einfrieren.

Revision ID: 0001
Revises:
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("username", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("full_name", sa.String(128)),
            sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.false()),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column(
                "billing_mode",
                sa.Enum("hourly", "salary", name="billing_mode"),
                nullable=False,
                server_default="salary",
            ),
            sa.Column("hourly_rate_eur", sa.Float, nullable=False, server_default="0"),
            sa.Column("monthly_target_hours", sa.Float, nullable=False, server_default="160"),
        )

    if "time_entries" not in existing:
        op.create_table(
            "time_entries",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("start_at", sa.DateTime, nullable=False, index=True),
            sa.Column("end_at", sa.DateTime),
            sa.Column("break_minutes", sa.Integer, nullable=False, server_default="0"),
            sa.Column("project", sa.String(128)),
            sa.Column("note", sa.Text),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("time_entries")
    op.drop_table("users")
    sa.Enum(name="billing_mode").drop(op.get_bind(), checkfirst=True)
