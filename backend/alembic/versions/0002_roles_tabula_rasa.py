"""Tabula rasa für Test-User, Rollen-Enum, supervisor_id, email.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tabula rasa: Test-Daten plattmachen, bevor Schema umgebaut wird.
    op.execute("DELETE FROM time_entries")
    op.execute("DELETE FROM users")

    sa.Enum("admin", "employer", "employee", name="user_role").create(
        op.get_bind(), checkfirst=True,
    )
    user_role_ref = postgresql.ENUM(
        "admin", "employer", "employee", name="user_role", create_type=False,
    )

    op.add_column(
        "users",
        sa.Column("role", user_role_ref, nullable=False, server_default="employee"),
    )
    op.add_column("users", sa.Column("supervisor_id", sa.Integer, nullable=True))
    op.add_column("users", sa.Column("email", sa.String(255), nullable=False))

    op.create_foreign_key(
        "fk_users_supervisor", "users", "users", ["supervisor_id"], ["id"],
    )
    op.create_index("ix_users_supervisor_id", "users", ["supervisor_id"])
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.drop_column("users", "is_admin")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.drop_index("ix_users_email", table_name="users")
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_index("ix_users_supervisor_id", table_name="users")
    op.drop_constraint("fk_users_supervisor", "users", type_="foreignkey")
    op.drop_column("users", "email")
    op.drop_column("users", "supervisor_id")
    op.drop_column("users", "role")
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
