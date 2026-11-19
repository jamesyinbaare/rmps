"""Add late registration windows tables

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-03-19 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exam_late_registration_windows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "exam_id",
            sa.Integer(),
            sa.ForeignKey("registration_exams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_exam_late_registration_windows_exam_id", "exam_late_registration_windows", ["exam_id"])
    op.create_index("ix_exam_late_registration_windows_is_active", "exam_late_registration_windows", ["is_active"])
    op.create_index(
        "ix_exam_late_registration_windows_created_by_user_id",
        "exam_late_registration_windows",
        ["created_by_user_id"],
    )

    op.create_table(
        "exam_late_registration_window_schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "window_id",
            sa.Integer(),
            sa.ForeignKey("exam_late_registration_windows.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "school_id",
            sa.Integer(),
            sa.ForeignKey("schools.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("window_id", "school_id", name="uq_late_window_school"),
    )
    op.create_index(
        "ix_exam_late_registration_window_schools_window_id",
        "exam_late_registration_window_schools",
        ["window_id"],
    )
    op.create_index(
        "ix_exam_late_registration_window_schools_school_id",
        "exam_late_registration_window_schools",
        ["school_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_exam_late_registration_window_schools_school_id",
        table_name="exam_late_registration_window_schools",
    )
    op.drop_index(
        "ix_exam_late_registration_window_schools_window_id",
        table_name="exam_late_registration_window_schools",
    )
    op.drop_table("exam_late_registration_window_schools")
    op.drop_index(
        "ix_exam_late_registration_windows_created_by_user_id",
        table_name="exam_late_registration_windows",
    )
    op.drop_index("ix_exam_late_registration_windows_is_active", table_name="exam_late_registration_windows")
    op.drop_index("ix_exam_late_registration_windows_exam_id", table_name="exam_late_registration_windows")
    op.drop_table("exam_late_registration_windows")
