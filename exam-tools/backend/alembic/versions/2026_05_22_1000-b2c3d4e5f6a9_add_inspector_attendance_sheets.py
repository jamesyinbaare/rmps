"""add inspector_attendance_sheets

Revision ID: b2c3d4e5f6a9
Revises: a1b2c3d4e5f8
Create Date: 2026-05-22

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6a9"
down_revision = "a1b2c3d4e5f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inspector_attendance_sheets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("inspector_exam_posting_id", sa.UUID(), nullable=False),
        sa.Column("center_id", sa.UUID(), nullable=False),
        sa.Column("examination_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.String(length=512), nullable=False),
        sa.Column("stored_path", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["center_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["inspector_exam_posting_id"],
            ["inspector_exam_postings.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_path"),
    )
    op.create_index(
        "ix_inspector_attendance_sheets_center_id",
        "inspector_attendance_sheets",
        ["center_id"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_attendance_sheets_examination_id",
        "inspector_attendance_sheets",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_attendance_sheets_exam_center_date",
        "inspector_attendance_sheets",
        ["examination_id", "center_id", "examination_date"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_attendance_sheets_exam_posting",
        "inspector_attendance_sheets",
        ["examination_id", "inspector_exam_posting_id"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_attendance_sheets_inspector_exam_posting_id",
        "inspector_attendance_sheets",
        ["inspector_exam_posting_id"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_attendance_sheets_uploaded_by_id",
        "inspector_attendance_sheets",
        ["uploaded_by_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("inspector_attendance_sheets")
