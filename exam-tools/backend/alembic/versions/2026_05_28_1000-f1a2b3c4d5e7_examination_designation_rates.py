"""Add examination_designation_rates for finance allowance configuration.

Revision ID: f1a2b3c4d5e7
Revises: e8f9a0b1c2d3
Create Date: 2026-05-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "f1a2b3c4d5e7"
down_revision: Union[str, None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "examination_designation_rates",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("designation", sa.String(length=64), nullable=False),
        sa.Column("daily_rate_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("commuting_allowance_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("airtime_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "daily_rate_ghs IS NULL OR daily_rate_ghs >= 0",
            name="ck_examination_designation_rates_daily_nonneg",
        ),
        sa.CheckConstraint(
            "commuting_allowance_ghs IS NULL OR commuting_allowance_ghs >= 0",
            name="ck_examination_designation_rates_commuting_nonneg",
        ),
        sa.CheckConstraint(
            "airtime_ghs IS NULL OR airtime_ghs >= 0",
            name="ck_examination_designation_rates_airtime_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "designation",
            name="uq_examination_designation_rates_exam_designation",
        ),
    )
    op.create_index(
        "ix_examination_designation_rates_examination_id",
        "examination_designation_rates",
        ["examination_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_examination_designation_rates_examination_id", table_name="examination_designation_rates")
    op.drop_table("examination_designation_rates")
