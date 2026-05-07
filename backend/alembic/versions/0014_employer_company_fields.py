"""Firmen- und HR-Kontakt-Felder am User für Arbeitgeber-Profile.

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as b:
        b.add_column(sa.Column("company_name", sa.String(255), nullable=True))
        b.add_column(sa.Column("company_address_line1", sa.String(255), nullable=True))
        b.add_column(sa.Column("company_address_line2", sa.String(255), nullable=True))
        b.add_column(sa.Column("company_postal_code", sa.String(10), nullable=True))
        b.add_column(sa.Column("company_city", sa.String(128), nullable=True))
        b.add_column(sa.Column("company_country", sa.String(2), nullable=True))
        b.add_column(sa.Column("hr_contact_name", sa.String(128), nullable=True))
        b.add_column(sa.Column("hr_contact_email", sa.String(255), nullable=True))
        b.add_column(sa.Column("hr_contact_phone", sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as b:
        for col in (
            "hr_contact_phone", "hr_contact_email", "hr_contact_name",
            "company_country", "company_city", "company_postal_code",
            "company_address_line2", "company_address_line1", "company_name",
        ):
            b.drop_column(col)
