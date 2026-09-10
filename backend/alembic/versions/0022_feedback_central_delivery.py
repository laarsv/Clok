"""Track reliable delivery of feedback to VRWB Admin.

Revision ID: 0022
Revises: 0021
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("feedback", sa.Column(
        "central_delivery_status", sa.String(20), nullable=False,
        server_default="pending"))
    op.add_column("feedback", sa.Column(
        "central_delivery_error", sa.String(500), nullable=True))
    op.add_column("feedback", sa.Column(
        "central_delivery_attempts", sa.Integer, nullable=False,
        server_default="0"))
    op.add_column("feedback", sa.Column(
        "central_next_attempt_at", sa.DateTime, nullable=True))
    op.add_column("feedback", sa.Column(
        "central_delivered_at", sa.DateTime, nullable=True))
    op.create_check_constraint(
        "ck_feedback_central_delivery_status", "feedback",
        "central_delivery_status IN ('pending','sent','failed')")
    op.create_check_constraint(
        "ck_feedback_central_delivery_attempts", "feedback",
        "central_delivery_attempts >= 0")


def downgrade() -> None:
    op.drop_constraint(
        "ck_feedback_central_delivery_attempts", "feedback", type_="check")
    op.drop_constraint(
        "ck_feedback_central_delivery_status", "feedback", type_="check")
    op.drop_column("feedback", "central_delivered_at")
    op.drop_column("feedback", "central_next_attempt_at")
    op.drop_column("feedback", "central_delivery_attempts")
    op.drop_column("feedback", "central_delivery_error")
    op.drop_column("feedback", "central_delivery_status")
