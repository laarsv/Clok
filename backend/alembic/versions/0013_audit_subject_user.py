"""audit_log.subject_user_id – ermöglicht Filter pro Mitarbeiter.

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "audit_log",
        sa.Column("subject_user_id", sa.Integer, nullable=True),
    )
    op.create_index(
        "ix_audit_log_subject", "audit_log", ["subject_user_id", "created_at"],
    )

    # Bestehende Einträge nachfüllen, wo der Bezug eindeutig ist:
    # - entity_type='user': entity_id IST der subject
    # - time_entry/absence/employment_terms/balance_adjustment: entity_id
    #   verweist auf eine Tabelle mit user_id. Mit Subqueries:
    op.execute(
        """
        UPDATE audit_log SET subject_user_id = entity_id
        WHERE entity_type = 'user' AND subject_user_id IS NULL
        """
    )
    for entity_type, table in (
        ("time_entry", "time_entries"),
        ("absence", "absences"),
        ("employment_terms", "employment_terms"),
        ("balance_adjustment", "balance_adjustments"),
    ):
        op.execute(
            f"""
            UPDATE audit_log
            SET subject_user_id = (
                SELECT user_id FROM {table} WHERE id = audit_log.entity_id
            )
            WHERE entity_type = '{entity_type}' AND subject_user_id IS NULL
            """
        )


def downgrade() -> None:
    op.drop_index("ix_audit_log_subject", table_name="audit_log")
    op.drop_column("audit_log", "subject_user_id")
