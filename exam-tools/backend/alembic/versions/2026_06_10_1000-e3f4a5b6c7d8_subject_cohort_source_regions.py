"""Subject cohort source regions for region-based membership.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-06-10

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: str | Sequence[str] | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subject_marking_group_source_regions",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("region", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["subject_marking_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("group_id", "region"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            "region",
            name="uq_subject_marking_group_source_region_per_subject",
        ),
    )
    op.create_index(
        op.f("ix_subject_marking_group_source_regions_examination_id"),
        "subject_marking_group_source_regions",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_subject_marking_group_source_regions_subject_id"),
        "subject_marking_group_source_regions",
        ["subject_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_subject_marking_group_source_regions_subject_id"),
        table_name="subject_marking_group_source_regions",
    )
    op.drop_index(
        op.f("ix_subject_marking_group_source_regions_examination_id"),
        table_name="subject_marking_group_source_regions",
    )
    op.drop_table("subject_marking_group_source_regions")
