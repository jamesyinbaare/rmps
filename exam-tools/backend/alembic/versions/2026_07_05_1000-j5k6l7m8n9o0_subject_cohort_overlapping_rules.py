"""Allow overlapping region/role rules across subject cohorts.

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-07-05
"""

from collections.abc import Sequence

from alembic import op

revision: str = "j5k6l7m8n9o0"
down_revision: str | Sequence[str] | None = "i4j5k6l7m8n9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_subject_marking_group_source_region_per_subject",
        "subject_marking_group_source_regions",
        type_="unique",
    )
    op.drop_constraint(
        "uq_subject_marking_group_source_role_per_subject",
        "subject_marking_group_source_roles",
        type_="unique",
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_subject_marking_group_source_role_per_subject",
        "subject_marking_group_source_roles",
        ["examination_id", "subject_id", "examiner_type"],
    )
    op.create_unique_constraint(
        "uq_subject_marking_group_source_region_per_subject",
        "subject_marking_group_source_regions",
        ["examination_id", "subject_id", "region"],
    )
