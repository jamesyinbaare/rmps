"""Separate quota region groups from reference-code region groups.

Revision ID: v8w9x0y1z2a3
Revises: u7v8w9x0y1z2
Create Date: 2026-06-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "v8w9x0y1z2a3"
down_revision: str | Sequence[str] | None = "u7v8w9x0y1z2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_examiner_quota_region_groups",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exam_quota_rg_groups_exam_id",
        "examination_examiner_quota_region_groups",
        ["examination_id"],
    )

    op.create_table(
        "examination_examiner_quota_region_group_regions",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("group_id", UUID(as_uuid=True), nullable=False),
        sa.Column("region", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["examination_examiner_quota_region_groups.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "region",
            name="uq_exam_quota_rg_regions_exam_region",
        ),
    )
    op.create_index(
        "ix_exam_quota_rg_regions_exam_id",
        "examination_examiner_quota_region_group_regions",
        ["examination_id"],
    )
    op.create_index(
        "ix_exam_quota_rg_regions_group_id",
        "examination_examiner_quota_region_group_regions",
        ["group_id"],
    )

    # Quota rows referenced reference-code groups; clear and re-point FK to quota groups.
    op.execute(sa.text("DELETE FROM subject_examiner_region_quotas"))
    op.drop_constraint(
        "subject_examiner_region_quotas_group_id_fkey",
        "subject_examiner_region_quotas",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "subject_examiner_region_quotas_group_id_fkey",
        "subject_examiner_region_quotas",
        "examination_examiner_quota_region_groups",
        ["group_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM subject_examiner_region_quotas"))
    op.drop_constraint(
        "subject_examiner_region_quotas_group_id_fkey",
        "subject_examiner_region_quotas",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "subject_examiner_region_quotas_group_id_fkey",
        "subject_examiner_region_quotas",
        "examination_examiner_region_groups",
        ["group_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index(
        "ix_exam_quota_rg_regions_group_id",
        table_name="examination_examiner_quota_region_group_regions",
    )
    op.drop_index(
        "ix_exam_quota_rg_regions_exam_id",
        table_name="examination_examiner_quota_region_group_regions",
    )
    op.drop_table("examination_examiner_quota_region_group_regions")
    op.drop_index(
        "ix_exam_quota_rg_groups_exam_id",
        table_name="examination_examiner_quota_region_groups",
    )
    op.drop_table("examination_examiner_quota_region_groups")
