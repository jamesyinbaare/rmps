"""Examiner subject allowance rates and regional travel (T&T) rates.

Revision ID: i7c8d9e0f1a2
Revises: h6b7c8d9e0f1
Create Date: 2026-06-14

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "i7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "h6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_examiner_subject_allowance_rates",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examiner_type", sa.String(), nullable=False),
        sa.Column("allowance_type", sa.String(length=64), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("amount_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "amount_ghs IS NULL OR amount_ghs >= 0",
            name="ck_exam_examiner_subject_allowance_rates_amount_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "examiner_type",
            "allowance_type",
            "subject_id",
            name="uq_exam_examiner_subject_allowance_rates",
        ),
    )
    op.create_index(
        "ix_examination_examiner_subject_allowance_rates_examination_id",
        "examination_examiner_subject_allowance_rates",
        ["examination_id"],
    )
    op.create_index(
        "ix_examination_examiner_subject_allowance_rates_subject_id",
        "examination_examiner_subject_allowance_rates",
        ["subject_id"],
    )

    op.create_table(
        "examination_examiner_travel_rates",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("region", sa.String(), nullable=False),
        sa.Column("amount_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "amount_ghs IS NULL OR amount_ghs >= 0",
            name="ck_examination_examiner_travel_rates_amount_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "region",
            name="uq_examination_examiner_travel_rates_exam_region",
        ),
    )
    op.create_index(
        "ix_examination_examiner_travel_rates_examination_id",
        "examination_examiner_travel_rates",
        ["examination_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_examination_examiner_travel_rates_examination_id",
        table_name="examination_examiner_travel_rates",
    )
    op.drop_table("examination_examiner_travel_rates")
    op.drop_index(
        "ix_examination_examiner_subject_allowance_rates_subject_id",
        table_name="examination_examiner_subject_allowance_rates",
    )
    op.drop_index(
        "ix_examination_examiner_subject_allowance_rates_examination_id",
        table_name="examination_examiner_subject_allowance_rates",
    )
    op.drop_table("examination_examiner_subject_allowance_rates")
