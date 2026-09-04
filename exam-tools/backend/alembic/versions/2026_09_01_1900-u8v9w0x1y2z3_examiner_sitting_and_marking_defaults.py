"""Examiner marking defaults, sitting allowance, default days, num_days.

Revision ID: u8v9w0x1y2z3
Revises: t7u8v9w0x1y2
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "u8v9w0x1y2z3"
down_revision: str | Sequence[str] | None = "t7u8v9w0x1y2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_examiner_marking_defaults",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("default_rate_paper_1_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("default_rate_paper_2_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "default_rate_paper_1_ghs IS NULL OR default_rate_paper_1_ghs >= 0",
            name="ck_exam_examiner_marking_defaults_p1_nonneg",
        ),
        sa.CheckConstraint(
            "default_rate_paper_2_ghs IS NULL OR default_rate_paper_2_ghs >= 0",
            name="ck_exam_examiner_marking_defaults_p2_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id"),
    )
    op.create_table(
        "examination_examiner_sitting_allowance_rates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examiner_type", sa.String(length=64), nullable=False),
        sa.Column("daily_rate_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "daily_rate_ghs IS NULL OR daily_rate_ghs >= 0",
            name="ck_exam_examiner_sitting_allowance_rates_rate_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "examiner_type",
            name="uq_exam_examiner_sitting_allowance_rates",
        ),
    )
    op.create_index(
        "ix_examination_examiner_sitting_allowance_rates_examination_id",
        "examination_examiner_sitting_allowance_rates",
        ["examination_id"],
    )
    op.create_table(
        "examination_examiner_default_days",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examiner_type", sa.String(length=64), nullable=False),
        sa.Column("default_days", sa.SmallInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "default_days IS NULL OR default_days >= 1",
            name="ck_exam_examiner_default_days_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "examiner_type",
            name="uq_exam_examiner_default_days",
        ),
    )
    op.create_index(
        "ix_examination_examiner_default_days_examination_id",
        "examination_examiner_default_days",
        ["examination_id"],
    )
    op.add_column("examiners", sa.Column("num_days", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "ck_examiner_num_days",
        "examiners",
        "num_days IS NULL OR num_days >= 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_examiner_num_days", "examiners", type_="check")
    op.drop_column("examiners", "num_days")
    op.drop_index("ix_examination_examiner_default_days_examination_id", "examination_examiner_default_days")
    op.drop_table("examination_examiner_default_days")
    op.drop_index(
        "ix_examination_examiner_sitting_allowance_rates_examination_id",
        "examination_examiner_sitting_allowance_rates",
    )
    op.drop_table("examination_examiner_sitting_allowance_rates")
    op.drop_table("examination_examiner_marking_defaults")
