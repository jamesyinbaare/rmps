"""Unique validation issue per subject_score + exam_subject + test_type.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-08-03 14:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: str | Sequence[str] | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Prefer pending over resolved/ignored; then highest id. Delete extras.
    op.execute(
        sa.text(
            """
            DELETE FROM subject_score_validation_issues
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY subject_score_id, exam_subject_id, test_type
                               ORDER BY
                                   CASE WHEN status::text IN ('pending', 'PENDING') THEN 0 ELSE 1 END,
                                   id DESC
                           ) AS rn
                    FROM subject_score_validation_issues
                ) ranked
                WHERE rn > 1
            )
            """
        )
    )
    op.create_unique_constraint(
        "uq_validation_issue_score_exam_test",
        "subject_score_validation_issues",
        ["subject_score_id", "exam_subject_id", "test_type"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_validation_issue_score_exam_test",
        "subject_score_validation_issues",
        type_="unique",
    )
