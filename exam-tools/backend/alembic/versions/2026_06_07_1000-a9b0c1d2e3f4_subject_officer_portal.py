"""Subject officer role, assignments, and marked script returns.

Revision ID: a9b0c1d2e3f4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-07

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic_postgresql_enum import TableReference
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a9b0c1d2e3f4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CREATE_INSPECTOR_PHONE_INDEX = """
CREATE UNIQUE INDEX ix_users_unique_phone_inspector ON users (phone_number)
WHERE role = 'INSPECTOR' AND phone_number IS NOT NULL
"""


def upgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_unique_phone_inspector"))
    op.sync_enum_values(
        enum_schema="public",
        enum_name="userrole",
        new_values=[
            "SUPER_ADMIN",
            "TEST_ADMIN_OFFICER",
            "FINANCE_OFFICER",
            "EXECUTIVE_VIEWER",
            "SUPERVISOR",
            "INSPECTOR",
            "SUBJECT_OFFICER",
            "DEPOT_KEEPER",
        ],
        affected_columns=[
            TableReference(table_schema="public", table_name="users", column_name="role"),
        ],
        enum_values_to_rename=[],
    )
    op.execute(sa.text(_CREATE_INSPECTOR_PHONE_INDEX))

    op.create_table(
        "subject_officer_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "examination_id",
            "subject_id",
            name="uq_subject_officer_assignment_user_exam_subject",
        ),
    )
    op.create_index("ix_subject_officer_assignments_user_id", "subject_officer_assignments", ["user_id"])
    op.create_index(
        "ix_subject_officer_assignments_examination_id",
        "subject_officer_assignments",
        ["examination_id"],
    )
    op.create_index("ix_subject_officer_assignments_subject_id", "subject_officer_assignments", ["subject_id"])
    op.create_index(
        "ix_subject_officer_assignments_created_by_user_id",
        "subject_officer_assignments",
        ["created_by_user_id"],
    )

    op.create_table(
        "examiner_marked_script_returns",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("examiner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paper_number", sa.SmallInteger(), nullable=False),
        sa.Column("allocation_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expected_booklets", sa.Integer(), nullable=False),
        sa.Column("returned_booklets", sa.Integer(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("verified_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("expected_booklets >= 0", name="ck_examiner_marked_script_return_expected"),
        sa.CheckConstraint(
            "returned_booklets IS NULL OR returned_booklets >= 0",
            name="ck_examiner_marked_script_return_returned",
        ),
        sa.ForeignKeyConstraint(["allocation_run_id"], ["allocation_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["verified_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            "examiner_id",
            "paper_number",
            "allocation_run_id",
            name="uq_examiner_marked_script_return",
        ),
    )
    op.create_index(
        "ix_examiner_marked_script_returns_examination_id",
        "examiner_marked_script_returns",
        ["examination_id"],
    )
    op.create_index(
        "ix_examiner_marked_script_returns_subject_id",
        "examiner_marked_script_returns",
        ["subject_id"],
    )
    op.create_index(
        "ix_examiner_marked_script_returns_examiner_id",
        "examiner_marked_script_returns",
        ["examiner_id"],
    )
    op.create_index(
        "ix_examiner_marked_script_returns_allocation_run_id",
        "examiner_marked_script_returns",
        ["allocation_run_id"],
    )
    op.create_index(
        "ix_examiner_marked_script_returns_verified_by_id",
        "examiner_marked_script_returns",
        ["verified_by_id"],
    )

    op.execute(
        sa.text(
            """
            CREATE UNIQUE INDEX ix_users_unique_phone_subject_officer ON users (phone_number)
            WHERE role = 'SUBJECT_OFFICER' AND phone_number IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_unique_phone_subject_officer"))
    op.drop_table("examiner_marked_script_returns")
    op.drop_table("subject_officer_assignments")

    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_unique_phone_inspector"))
    op.sync_enum_values(
        enum_schema="public",
        enum_name="userrole",
        new_values=[
            "SUPER_ADMIN",
            "TEST_ADMIN_OFFICER",
            "FINANCE_OFFICER",
            "EXECUTIVE_VIEWER",
            "SUPERVISOR",
            "INSPECTOR",
            "DEPOT_KEEPER",
        ],
        affected_columns=[
            TableReference(table_schema="public", table_name="users", column_name="role"),
        ],
        enum_values_to_rename=[],
    )
    op.execute(sa.text(_CREATE_INSPECTOR_PHONE_INDEX))
