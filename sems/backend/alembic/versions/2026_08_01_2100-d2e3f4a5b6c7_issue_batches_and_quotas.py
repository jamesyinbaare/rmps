"""Add issue batches, batch_id on issues, and clerk quota tables.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-08-01 21:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: str | Sequence[str] | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "issue_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("test_type", sa.Integer(), nullable=False),
        sa.Column("has_document", sa.Boolean(), nullable=False),
        sa.Column("target_size", sa.Integer(), nullable=False),
        sa.Column("tolerance", sa.Integer(), nullable=False),
        sa.Column("issue_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_issue_batches_name", "issue_batches", ["name"], unique=True)
    op.create_index("ix_issue_batches_exam_id", "issue_batches", ["exam_id"])
    op.create_index("ix_issue_batches_subject_id", "issue_batches", ["subject_id"])
    op.create_index("ix_issue_batches_test_type", "issue_batches", ["test_type"])
    op.create_index("ix_issue_batches_has_document", "issue_batches", ["has_document"])
    op.create_index("ix_issue_batches_assigned_to_user_id", "issue_batches", ["assigned_to_user_id"])

    op.add_column(
        "subject_score_validation_issues",
        sa.Column("batch_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_subject_score_validation_issues_batch_id",
        "subject_score_validation_issues",
        ["batch_id"],
    )
    op.create_foreign_key(
        "fk_subject_score_validation_issues_batch_id_issue_batches",
        "subject_score_validation_issues",
        "issue_batches",
        ["batch_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "clerk_quota_settings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("daily_resolve_quota", sa.Integer(), nullable=False, server_default="200"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    op.create_table(
        "clerk_daily_quota_overrides",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quota_date", sa.Date(), nullable=False),
        sa.Column("override_quota", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "quota_date", name="uq_clerk_daily_quota_override"),
    )
    op.create_index("ix_clerk_daily_quota_overrides_user_id", "clerk_daily_quota_overrides", ["user_id"])
    op.create_index("ix_clerk_daily_quota_overrides_quota_date", "clerk_daily_quota_overrides", ["quota_date"])


def downgrade() -> None:
    op.drop_index("ix_clerk_daily_quota_overrides_quota_date", table_name="clerk_daily_quota_overrides")
    op.drop_index("ix_clerk_daily_quota_overrides_user_id", table_name="clerk_daily_quota_overrides")
    op.drop_table("clerk_daily_quota_overrides")
    op.drop_table("clerk_quota_settings")

    op.drop_constraint(
        "fk_subject_score_validation_issues_batch_id_issue_batches",
        "subject_score_validation_issues",
        type_="foreignkey",
    )
    op.drop_index("ix_subject_score_validation_issues_batch_id", table_name="subject_score_validation_issues")
    op.drop_column("subject_score_validation_issues", "batch_id")

    op.drop_index("ix_issue_batches_assigned_to_user_id", table_name="issue_batches")
    op.drop_index("ix_issue_batches_has_document", table_name="issue_batches")
    op.drop_index("ix_issue_batches_test_type", table_name="issue_batches")
    op.drop_index("ix_issue_batches_subject_id", table_name="issue_batches")
    op.drop_index("ix_issue_batches_exam_id", table_name="issue_batches")
    op.drop_index("ix_issue_batches_name", table_name="issue_batches")
    op.drop_table("issue_batches")
