"""Subject examiner quota settings (per-subject total headcount).

Revision ID: u7v8w9x0y1z2
Revises: t6u7v8w9x0y1
Create Date: 2026-06-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "u7v8w9x0y1z2"
down_revision: str | Sequence[str] | None = "t6u7v8w9x0y1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subject_examiner_quota_settings",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("total_quota", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "total_quota IS NULL OR total_quota >= 0",
            name="ck_subject_examiner_quota_settings_nonneg",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            name="uq_subject_examiner_quota_settings_exam_subj",
        ),
    )
    op.create_index(
        "ix_subject_examiner_quota_settings_examination_id",
        "subject_examiner_quota_settings",
        ["examination_id"],
    )
    op.create_index(
        "ix_subject_examiner_quota_settings_subject_id",
        "subject_examiner_quota_settings",
        ["subject_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_subject_examiner_quota_settings_subject_id", table_name="subject_examiner_quota_settings")
    op.drop_index(
        "ix_subject_examiner_quota_settings_examination_id",
        table_name="subject_examiner_quota_settings",
    )
    op.drop_table("subject_examiner_quota_settings")
