"""Sonderurlaubsarten: special, parental, training.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL ≥ 12: ALTER TYPE ADD VALUE ist transaktionssicher.
    op.execute("ALTER TYPE absence_type ADD VALUE IF NOT EXISTS 'special'")
    op.execute("ALTER TYPE absence_type ADD VALUE IF NOT EXISTS 'parental'")
    op.execute("ALTER TYPE absence_type ADD VALUE IF NOT EXISTS 'training'")


def downgrade() -> None:
    # ENUM-Werte lassen sich in Postgres nicht entfernen, ohne die Spalte
    # neu zu bauen. Bewusst no-op – falls nötig manuelles SQL.
    pass
