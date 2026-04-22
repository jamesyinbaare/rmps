"""allocation_campaigns: dedupe by (examination_id, subject_id, paper_number); unique constraint.

Revision ID: b7c4d5e6f7a8
Revises: a8f3c2b1e9d0
Create Date: 2026-04-14 14:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "b7c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a8f3c2b1e9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        text(
            """
            WITH ranked AS (
                SELECT id,
                    ROW_NUMBER() OVER (
                        PARTITION BY examination_id, subject_id, paper_number
                        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                    ) AS rn
                FROM allocation_campaigns
            )
            DELETE FROM allocation_campaigns a
            USING ranked r
            WHERE a.id = r.id AND r.rn > 1
            """
        )
    )
    op.create_unique_constraint(
        "uq_allocation_exam_subject_paper",
        "allocation_campaigns",
        ["examination_id", "subject_id", "paper_number"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_allocation_exam_subject_paper", "allocation_campaigns", type_="unique")
