"""Add paper_number to examiner marking rates.

Revision ID: o2a3b4c5d6e8
Revises: n1a2b3c4d5e7
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "o2a3b4c5d6e8"
down_revision: str | Sequence[str] | None = "n1a2b3c4d5e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "examination_examiner_marking_rates",
        sa.Column("paper_number", sa.SmallInteger(), nullable=False, server_default="1"),
    )
    op.alter_column("examination_examiner_marking_rates", "paper_number", server_default=None)
    op.drop_constraint(
        "uq_examination_examiner_marking_rates_exam_subject",
        "examination_examiner_marking_rates",
        type_="unique",
    )
    op.create_check_constraint(
        "ck_examination_examiner_marking_rates_paper_number",
        "examination_examiner_marking_rates",
        "paper_number >= 1",
    )
    op.create_unique_constraint(
        "uq_examination_examiner_marking_rates_exam_subject_paper",
        "examination_examiner_marking_rates",
        ["examination_id", "subject_id", "paper_number"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_examination_examiner_marking_rates_exam_subject_paper",
        "examination_examiner_marking_rates",
        type_="unique",
    )
    op.drop_constraint(
        "ck_examination_examiner_marking_rates_paper_number",
        "examination_examiner_marking_rates",
        type_="check",
    )
    op.create_unique_constraint(
        "uq_examination_examiner_marking_rates_exam_subject",
        "examination_examiner_marking_rates",
        ["examination_id", "subject_id"],
    )
    op.drop_column("examination_examiner_marking_rates", "paper_number")
