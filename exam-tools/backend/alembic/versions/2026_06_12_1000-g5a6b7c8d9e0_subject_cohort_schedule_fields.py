"""Expand subject cohort schedule fields.

Revision ID: g5a6b7c8d9e0
Revises: f4a5b6c7d8e9
Create Date: 2026-06-12

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "g5a6b7c8d9e0"
down_revision: str | Sequence[str] | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subject_marking_groups",
        sa.Column("coordination_start_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column("coordination_end_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column("marking_start_date", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column("marking_end_date", sa.DateTime(), nullable=True),
    )
    op.alter_column(
        "subject_marking_groups",
        "marked_script_return_deadline",
        new_column_name="marked_script_submission_deadline",
    )


def downgrade() -> None:
    op.alter_column(
        "subject_marking_groups",
        "marked_script_submission_deadline",
        new_column_name="marked_script_return_deadline",
    )
    op.drop_column("subject_marking_groups", "marking_end_date")
    op.drop_column("subject_marking_groups", "marking_start_date")
    op.drop_column("subject_marking_groups", "coordination_end_time")
    op.drop_column("subject_marking_groups", "coordination_start_time")
