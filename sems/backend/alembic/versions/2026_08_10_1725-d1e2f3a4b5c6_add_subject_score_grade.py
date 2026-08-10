"""Add persisted grade column to subject_scores.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-08-10 17:25:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d1e2f3a4b5c6"
down_revision: str | Sequence[str] | None = "c0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GRADE_VALUES = (
    "Fail",
    "Pass",
    "Lower Credit",
    "Credit",
    "Upper Credit",
    "Distinction",
    "Absent",
    "Pending",
    "Blocked",
    "Cancelled",
)


def upgrade() -> None:
    grade_enum = postgresql.ENUM(*GRADE_VALUES, name="grade", create_type=False)
    grade_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "subject_scores",
        sa.Column("grade", grade_enum, nullable=True),
    )
    op.create_index("ix_subject_scores_grade", "subject_scores", ["grade"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_subject_scores_grade", table_name="subject_scores")
    op.drop_column("subject_scores", "grade")
    postgresql.ENUM(name="grade").drop(op.get_bind(), checkfirst=True)
