"""Exam officials keyed by examination centre (host), not per satellite school.

Revision ID: aabbccddeeff
Revises: f8a9b0c1d2e3
Create Date: 2026-05-16 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = "aabbccddeeff"
down_revision: Union[str, Sequence[str], None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("exam_school_officials", "exam_centre_officials")
    op.execute("ALTER TABLE exam_centre_officials RENAME COLUMN school_id TO center_id")
    op.drop_index("ix_exam_school_officials_school_id", table_name="exam_centre_officials")
    op.drop_index("ix_exam_school_officials_exam_school", table_name="exam_centre_officials")
    op.drop_index("ix_exam_school_officials_examination_id", table_name="exam_centre_officials")
    op.create_index(
        "ix_exam_centre_officials_examination_id",
        "exam_centre_officials",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_centre_officials_center_id",
        "exam_centre_officials",
        ["center_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_centre_officials_exam_center",
        "exam_centre_officials",
        ["examination_id", "center_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_exam_centre_officials_exam_center", table_name="exam_centre_officials")
    op.drop_index("ix_exam_centre_officials_center_id", table_name="exam_centre_officials")
    op.drop_index("ix_exam_centre_officials_examination_id", table_name="exam_centre_officials")
    op.execute("ALTER TABLE exam_centre_officials RENAME COLUMN center_id TO school_id")
    op.rename_table("exam_centre_officials", "exam_school_officials")
    op.create_index(
        "ix_exam_school_officials_examination_id",
        "exam_school_officials",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_school_officials_school_id",
        "exam_school_officials",
        ["school_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_school_officials_exam_school",
        "exam_school_officials",
        ["examination_id", "school_id"],
        unique=False,
    )
