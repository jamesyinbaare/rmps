"""Add per-examiner payout adjustments.

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "z3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "y2z3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examiner_payout_adjustments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examiner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=False),
        sa.Column("amount_ghs", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_taxable", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("amount_ghs > 0", name="ck_examiner_payout_adjustment_amount_positive"),
        sa.CheckConstraint("sort_order >= 0", name="ck_examiner_payout_adjustment_sort_order"),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_examiner_payout_adjustments_examiner_id",
        "examiner_payout_adjustments",
        ["examiner_id"],
        unique=False,
    )
    op.alter_column("examiner_payout_adjustments", "sort_order", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_examiner_payout_adjustments_examiner_id", table_name="examiner_payout_adjustments")
    op.drop_table("examiner_payout_adjustments")
