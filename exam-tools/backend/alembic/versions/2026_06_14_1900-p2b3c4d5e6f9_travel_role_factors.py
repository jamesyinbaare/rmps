"""Add per-role T&T multiplier factors.

Revision ID: p2b3c4d5e6f9
Revises: o2a3b4c5d6e8
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "p2b3c4d5e6f9"
down_revision: str | Sequence[str] | None = "o2a3b4c5d6e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_examiner_travel_role_factors",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examiner_type", sa.String(length=64), nullable=False),
        sa.Column("factor", sa.Numeric(6, 3), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "factor IS NULL OR factor > 0",
            name="ck_examination_examiner_travel_role_factors_factor_positive",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "examiner_type",
            name="uq_examination_examiner_travel_role_factors_exam_role",
        ),
    )
    op.create_index(
        "ix_examination_examiner_travel_role_factors_examination_id",
        "examination_examiner_travel_role_factors",
        ["examination_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_examination_examiner_travel_role_factors_examination_id",
        table_name="examination_examiner_travel_role_factors",
    )
    op.drop_table("examination_examiner_travel_role_factors")
