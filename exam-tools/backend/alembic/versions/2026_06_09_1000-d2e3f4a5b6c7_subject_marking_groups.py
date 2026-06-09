"""Subject marking groups with coordination and return dates.

Revision ID: d2e3f4a5b6c7
Revises: b0c1d2e3f4a5
Create Date: 2026-06-09

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: str | Sequence[str] | None = "b0c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subject_marking_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("coordination_date", sa.DateTime(), nullable=True),
        sa.Column("marked_script_return_deadline", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_subject_marking_groups_examination_id"),
        "subject_marking_groups",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_subject_marking_groups_subject_id"),
        "subject_marking_groups",
        ["subject_id"],
        unique=False,
    )

    op.create_table(
        "subject_marking_group_members",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examiner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["subject_marking_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("group_id", "examiner_id"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            "examiner_id",
            name="uq_subject_marking_group_member_per_subject",
        ),
    )
    op.create_index(
        op.f("ix_subject_marking_group_members_examination_id"),
        "subject_marking_group_members",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_subject_marking_group_members_subject_id"),
        "subject_marking_group_members",
        ["subject_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_subject_marking_group_members_subject_id"), table_name="subject_marking_group_members")
    op.drop_index(op.f("ix_subject_marking_group_members_examination_id"), table_name="subject_marking_group_members")
    op.drop_table("subject_marking_group_members")
    op.drop_index(op.f("ix_subject_marking_groups_subject_id"), table_name="subject_marking_groups")
    op.drop_index(op.f("ix_subject_marking_groups_examination_id"), table_name="subject_marking_groups")
    op.drop_table("subject_marking_groups")
