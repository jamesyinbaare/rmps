"""add examiner_marking_attendance_sheets

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e8
Create Date: 2026-07-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g2h3i4j5k6l7"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examiner_marking_attendance_sheets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("subject_marking_group_id", sa.UUID(), nullable=False),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.String(length=512), nullable=False),
        sa.Column("stored_path", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["subject_marking_group_id"],
            ["subject_marking_groups.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_path"),
    )
    op.create_index(
        "ix_examiner_marking_attendance_exam_subject_date",
        "examiner_marking_attendance_sheets",
        ["examination_id", "subject_id", "attendance_date"],
        unique=False,
    )
    op.create_index(
        "ix_examiner_marking_attendance_group_date",
        "examiner_marking_attendance_sheets",
        ["subject_marking_group_id", "attendance_date"],
        unique=False,
    )
    op.create_index(
        "ix_examiner_marking_attendance_sheets_examination_id",
        "examiner_marking_attendance_sheets",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        "ix_examiner_marking_attendance_sheets_subject_id",
        "examiner_marking_attendance_sheets",
        ["subject_id"],
        unique=False,
    )
    op.create_index(
        "ix_examiner_marking_attendance_sheets_subject_marking_group_id",
        "examiner_marking_attendance_sheets",
        ["subject_marking_group_id"],
        unique=False,
    )
    op.create_index(
        "ix_examiner_marking_attendance_sheets_uploaded_by_id",
        "examiner_marking_attendance_sheets",
        ["uploaded_by_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("examiner_marking_attendance_sheets")
