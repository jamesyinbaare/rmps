"""add inspector_exam_postings

Revision ID: b1c2d3e4f5a6
Revises: cc00dd11ee22
Create Date: 2026-05-17

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b1c2d3e4f5a6"
down_revision = "cc00dd11ee22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inspector_exam_postings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("inspector_user_id", sa.UUID(), nullable=False),
        sa.Column("center_id", sa.UUID(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=False),
        sa.Column("subject_scope", sa.String(length=16), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("effective_from <= effective_to", name="ck_inspector_exam_posting_dates"),
        sa.ForeignKeyConstraint(["center_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inspector_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_inspector_exam_postings_center_id", "inspector_exam_postings", ["center_id"], unique=False
    )
    op.create_index(
        "ix_inspector_exam_postings_created_by_user_id",
        "inspector_exam_postings",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_exam_postings_examination_id",
        "inspector_exam_postings",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_exam_postings_inspector_user_id",
        "inspector_exam_postings",
        ["inspector_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_inspector_exam_postings_exam_inspector",
        "inspector_exam_postings",
        ["examination_id", "inspector_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_inspector_exam_postings_exam_inspector", table_name="inspector_exam_postings")
    op.drop_index("ix_inspector_exam_postings_inspector_user_id", table_name="inspector_exam_postings")
    op.drop_index("ix_inspector_exam_postings_examination_id", table_name="inspector_exam_postings")
    op.drop_index("ix_inspector_exam_postings_created_by_user_id", table_name="inspector_exam_postings")
    op.drop_index("ix_inspector_exam_postings_center_id", table_name="inspector_exam_postings")
    op.drop_table("inspector_exam_postings")
