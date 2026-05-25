"""Add subject_scope to officials/attendance and inspector submission settings.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-05-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exam_centre_officials",
        sa.Column("subject_scope", sa.String(length=16), nullable=False, server_default="CORE"),
    )
    op.create_index(
        "ix_exam_centre_officials_exam_center_scope",
        "exam_centre_officials",
        ["examination_id", "center_id", "subject_scope"],
    )

    op.add_column(
        "inspector_attendance_sheets",
        sa.Column("subject_scope", sa.String(length=16), nullable=False, server_default="CORE"),
    )
    op.create_index(
        "ix_inspector_attendance_sheets_exam_center_date_scope",
        "inspector_attendance_sheets",
        ["examination_id", "center_id", "examination_date", "subject_scope"],
    )

    op.create_table(
        "examination_inspector_submission_settings",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("submission_period_start", sa.Date(), nullable=True),
        sa.Column("submission_period_end", sa.Date(), nullable=True),
        sa.Column("officials_core_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("officials_elective_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id"),
    )

    op.execute(
        """
        INSERT INTO examination_inspector_submission_settings (examination_id, officials_core_enabled, officials_elective_enabled)
        SELECT id, true, true FROM examinations
        ON CONFLICT (examination_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("examination_inspector_submission_settings")
    op.drop_index("ix_inspector_attendance_sheets_exam_center_date_scope", table_name="inspector_attendance_sheets")
    op.drop_column("inspector_attendance_sheets", "subject_scope")
    op.drop_index("ix_exam_centre_officials_exam_center_scope", table_name="exam_centre_officials")
    op.drop_column("exam_centre_officials", "subject_scope")
