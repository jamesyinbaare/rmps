"""Subject examiner allowance rates shared across all roles.

Revision ID: j8d9e0f1a2b3
Revises: i7c8d9e0f1a2
Create Date: 2026-06-14

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "j8d9e0f1a2b3"
down_revision: str | Sequence[str] | None = "i7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Keep one row per (examination_id, allowance_type, subject_id); prefer highest non-null amount.
    op.execute(
        sa.text(
            """
            DELETE FROM examination_examiner_subject_allowance_rates
            WHERE id NOT IN (
                SELECT DISTINCT ON (examination_id, allowance_type, subject_id) id
                FROM examination_examiner_subject_allowance_rates
                ORDER BY
                    examination_id,
                    allowance_type,
                    subject_id,
                    amount_ghs DESC NULLS LAST,
                    id
            )
            """
        )
    )

    op.drop_constraint("uq_exam_examiner_subject_allowance_rates", "examination_examiner_subject_allowance_rates")
    op.drop_column("examination_examiner_subject_allowance_rates", "examiner_type")
    op.create_unique_constraint(
        "uq_exam_examiner_subject_allowance_rates",
        "examination_examiner_subject_allowance_rates",
        ["examination_id", "allowance_type", "subject_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_exam_examiner_subject_allowance_rates", "examination_examiner_subject_allowance_rates")
    op.add_column(
        "examination_examiner_subject_allowance_rates",
        sa.Column("examiner_type", sa.String(), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE examination_examiner_subject_allowance_rates "
            "SET examiner_type = 'assistant_examiner' WHERE examiner_type IS NULL"
        )
    )
    op.alter_column("examination_examiner_subject_allowance_rates", "examiner_type", nullable=False)
    op.create_unique_constraint(
        "uq_exam_examiner_subject_allowance_rates",
        "examination_examiner_subject_allowance_rates",
        ["examination_id", "examiner_type", "allowance_type", "subject_id"],
    )
