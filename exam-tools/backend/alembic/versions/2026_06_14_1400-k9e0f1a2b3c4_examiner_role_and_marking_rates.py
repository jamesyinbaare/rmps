"""Replace subject allowance matrix with role allowances and marking rates.

Revision ID: k9e0f1a2b3c4
Revises: j8d9e0f1a2b3
Create Date: 2026-06-14

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "k9e0f1a2b3c4"
down_revision: str | Sequence[str] | None = "j8d9e0f1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(
        "ix_examination_examiner_subject_allowance_rates_subject_id",
        table_name="examination_examiner_subject_allowance_rates",
    )
    op.drop_index(
        "ix_examination_examiner_subject_allowance_rates_examination_id",
        table_name="examination_examiner_subject_allowance_rates",
    )
    op.drop_table("examination_examiner_subject_allowance_rates")

    op.create_table(
        "examination_examiner_role_allowance_rates",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examiner_type", sa.String(length=64), nullable=False),
        sa.Column("allowance_type", sa.String(length=64), nullable=False),
        sa.Column("amount_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "amount_ghs IS NULL OR amount_ghs >= 0",
            name="ck_exam_examiner_role_allowance_rates_amount_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "examiner_type",
            "allowance_type",
            name="uq_exam_examiner_role_allowance_rates",
        ),
    )
    op.create_index(
        "ix_examination_examiner_role_allowance_rates_examination_id",
        "examination_examiner_role_allowance_rates",
        ["examination_id"],
    )

    op.create_table(
        "examination_examiner_marking_rates",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("rate_per_script_ghs", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "rate_per_script_ghs IS NULL OR rate_per_script_ghs >= 0",
            name="ck_examination_examiner_marking_rates_rate_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            name="uq_examination_examiner_marking_rates_exam_subject",
        ),
    )
    op.create_index(
        "ix_examination_examiner_marking_rates_examination_id",
        "examination_examiner_marking_rates",
        ["examination_id"],
    )
    op.create_index(
        "ix_examination_examiner_marking_rates_subject_id",
        "examination_examiner_marking_rates",
        ["subject_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_examination_examiner_marking_rates_subject_id", table_name="examination_examiner_marking_rates")
    op.drop_index(
        "ix_examination_examiner_marking_rates_examination_id",
        table_name="examination_examiner_marking_rates",
    )
    op.drop_table("examination_examiner_marking_rates")
    op.drop_index(
        "ix_examination_examiner_role_allowance_rates_examination_id",
        table_name="examination_examiner_role_allowance_rates",
    )
    op.drop_table("examination_examiner_role_allowance_rates")

    op.create_table(
        "examination_examiner_subject_allowance_rates",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
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
