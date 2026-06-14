"""Regional examiner quotas, quota_waitlisted status, and examiner attendances.

Revision ID: t6u7v8w9x0y1
Revises: s5t6u7v8w9x0
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "t6u7v8w9x0y1"
down_revision: str | Sequence[str] | None = "s5t6u7v8w9x0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subject_examiner_region_quotas",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("group_id", UUID(as_uuid=True), nullable=False),
        sa.Column("examiner_type", sa.String(length=32), nullable=True),
        sa.Column("quota_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("quota_count >= 0", name="ck_subject_examiner_region_quotas_nonneg"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["examination_examiner_region_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            "group_id",
            "examiner_type",
            name="uq_subject_examiner_region_quotas_exam_subj_grp_type",
        ),
    )
    op.create_index(
        "ix_subject_examiner_region_quotas_examination_id",
        "subject_examiner_region_quotas",
        ["examination_id"],
    )
    op.create_index(
        "ix_subject_examiner_region_quotas_subject_id",
        "subject_examiner_region_quotas",
        ["subject_id"],
    )
    op.create_index(
        "ix_subject_examiner_region_quotas_group_id",
        "subject_examiner_region_quotas",
        ["group_id"],
    )

    op.create_table(
        "examiner_attendances",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examiner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("reference_code", sa.String(length=16), nullable=False),
        sa.Column("marked_by_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("marked_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["marked_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "examiner_id",
            "attendance_date",
            name="uq_examiner_attendances_exam_examiner_date",
        ),
    )
    op.create_index(
        "ix_examiner_attendances_examination_id",
        "examiner_attendances",
        ["examination_id"],
    )
    op.create_index(
        "ix_examiner_attendances_examiner_id",
        "examiner_attendances",
        ["examiner_id"],
    )
    op.create_index(
        "ix_examiner_attendances_marked_by_user_id",
        "examiner_attendances",
        ["marked_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_examiner_attendances_marked_by_user_id", table_name="examiner_attendances")
    op.drop_index("ix_examiner_attendances_examiner_id", table_name="examiner_attendances")
    op.drop_index("ix_examiner_attendances_examination_id", table_name="examiner_attendances")
    op.drop_table("examiner_attendances")

    op.drop_index("ix_subject_examiner_region_quotas_group_id", table_name="subject_examiner_region_quotas")
    op.drop_index("ix_subject_examiner_region_quotas_subject_id", table_name="subject_examiner_region_quotas")
    op.drop_index("ix_subject_examiner_region_quotas_examination_id", table_name="subject_examiner_region_quotas")
    op.drop_table("subject_examiner_region_quotas")
