"""Subject cohort source roles for role-based membership.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-06-11

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: str | Sequence[str] | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subject_marking_group_source_roles",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("examiner_type", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["subject_marking_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("group_id", "examiner_type"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            "examiner_type",
            name="uq_subject_marking_group_source_role_per_subject",
        ),
    )
    op.create_index(
        op.f("ix_subject_marking_group_source_roles_examination_id"),
        "subject_marking_group_source_roles",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_subject_marking_group_source_roles_subject_id"),
        "subject_marking_group_source_roles",
        ["subject_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_subject_marking_group_source_roles_subject_id"),
        table_name="subject_marking_group_source_roles",
    )
    op.drop_index(
        op.f("ix_subject_marking_group_source_roles_examination_id"),
        table_name="subject_marking_group_source_roles",
    )
    op.drop_table("subject_marking_group_source_roles")
