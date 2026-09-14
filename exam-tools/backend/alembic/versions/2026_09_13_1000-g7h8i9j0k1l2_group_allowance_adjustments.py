"""Add allowance-group special allowance / adjustment lines.

Revision ID: g7h8i9j0k1l2
Revises: z3a4b5c6d7e8
Create Date: 2026-09-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "g7h8i9j0k1l2"
down_revision: str | Sequence[str] | None = "z3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_allowance_group_adjustments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=False),
        sa.Column("amount_ghs", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_taxable", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "amount_ghs > 0",
            name="ck_exam_allowance_group_adjustment_amount_positive",
        ),
        sa.CheckConstraint(
            "sort_order >= 0",
            name="ck_exam_allowance_group_adjustment_sort_order",
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["examination_allowance_groups.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_examination_allowance_group_adjustments_group_id",
        "examination_allowance_group_adjustments",
        ["group_id"],
        unique=False,
    )
    op.alter_column(
        "examination_allowance_group_adjustments",
        "sort_order",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_examination_allowance_group_adjustments_group_id",
        table_name="examination_allowance_group_adjustments",
    )
    op.drop_table("examination_allowance_group_adjustments")
