"""Examination subject script series count (admin-configured)

Revision ID: c3d9f0a12e55
Revises: b2c8e9d01f44
Create Date: 2026-04-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d9f0a12e55"
down_revision: Union[str, Sequence[str], None] = "b2c8e9d01f44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "examination_subject_script_series",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("series_count", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "series_count >= 1 AND series_count <= 32767",
            name="ck_exam_subject_script_series_count",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id", "subject_id"),
    )
    op.create_index(
        "ix_examination_subject_script_series_subject_id",
        "examination_subject_script_series",
        ["subject_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_examination_subject_script_series_subject_id", table_name="examination_subject_script_series")
    op.drop_table("examination_subject_script_series")
