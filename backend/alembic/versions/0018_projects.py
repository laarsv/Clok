"""Projekte: Tabelle + time_entries.project_id, Freitext-Migration.

Bestehende Freitext-Werte in time_entries.project werden je Arbeitgeber
(owner = supervisor_id des Eintrag-Users, sonst dessen eigene id) zu echten
Projekten zusammengefasst und an die Einträge verknüpft. Anschließend fällt
die Freitext-Spalte weg.

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-01
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("owner_user_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("client", sa.String(128), nullable=True),
        sa.Column("color", sa.String(16), nullable=True),
        sa.Column("hours_budget", sa.Float, nullable=True),
        sa.Column("archived_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("owner_user_id", "name", name="uq_project_owner_name"),
    )
    op.add_column(
        "time_entries",
        sa.Column("project_id", sa.Integer,
                  sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_time_entries_project_id", "time_entries", ["project_id"])

    # --- Backfill: Freitext-Projekte → echte Projekte je Arbeitgeber ---
    conn = op.get_bind()
    now = datetime.utcnow()
    pairs = conn.execute(sa.text(
        "SELECT DISTINCT COALESCE(u.supervisor_id, u.id) AS owner_id, te.project AS name "
        "FROM time_entries te JOIN users u ON u.id = te.user_id "
        "WHERE te.project IS NOT NULL AND te.project <> ''"
    )).fetchall()
    for owner_id, name in pairs:
        conn.execute(
            sa.text(
                "INSERT INTO projects (owner_user_id, name, created_at) "
                "VALUES (:owner, :name, :now)"
            ),
            {"owner": owner_id, "name": name, "now": now},
        )
        pid = conn.execute(
            sa.text("SELECT id FROM projects WHERE owner_user_id = :owner AND name = :name"),
            {"owner": owner_id, "name": name},
        ).scalar()
        conn.execute(
            sa.text(
                "UPDATE time_entries SET project_id = :pid WHERE id IN ("
                "  SELECT te.id FROM time_entries te JOIN users u ON u.id = te.user_id "
                "  WHERE te.project = :name AND COALESCE(u.supervisor_id, u.id) = :owner"
                ")"
            ),
            {"pid": pid, "name": name, "owner": owner_id},
        )

    op.drop_column("time_entries", "project")


def downgrade() -> None:
    op.add_column("time_entries", sa.Column("project", sa.String(128), nullable=True))
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE time_entries SET project = ("
        "  SELECT p.name FROM projects p WHERE p.id = time_entries.project_id"
        ") WHERE project_id IS NOT NULL"
    ))
    op.drop_index("ix_time_entries_project_id", table_name="time_entries")
    op.drop_column("time_entries", "project_id")
    op.drop_table("projects")
