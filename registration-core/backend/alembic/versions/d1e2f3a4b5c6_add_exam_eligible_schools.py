"""Add exam_eligible_schools allow-list table

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-03-19 08:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exam_eligible_schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "exam_id",
            sa.Integer(),
            sa.ForeignKey("registration_exams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "school_id",
            sa.Integer(),
            sa.ForeignKey("schools.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("exam_id", "school_id", name="uq_exam_eligible_school"),
    )
    op.create_index("ix_exam_eligible_schools_exam_id", "exam_eligible_schools", ["exam_id"])
    op.create_index("ix_exam_eligible_schools_school_id", "exam_eligible_schools", ["school_id"])


def downgrade() -> None:
    op.drop_index("ix_exam_eligible_schools_school_id", table_name="exam_eligible_schools")
    op.drop_index("ix_exam_eligible_schools_exam_id", table_name="exam_eligible_schools")
    op.drop_table("exam_eligible_schools")
