"""Add resolved_by_user_id to subject_score_validation_issues.

Revision ID: c1d2e3f4a5b6
Revises: b7c8d9e0f1a2
Create Date: 2026-08-01 17:26:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subject_score_validation_issues",
        sa.Column("resolved_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        op.f("ix_subject_score_validation_issues_resolved_by_user_id"),
        "subject_score_validation_issues",
        ["resolved_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_subject_score_validation_issues_resolved_by_user_id_users",
        "subject_score_validation_issues",
        "users",
        ["resolved_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_subject_score_validation_issues_resolved_by_user_id_users",
        "subject_score_validation_issues",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_subject_score_validation_issues_resolved_by_user_id"),
        table_name="subject_score_validation_issues",
    )
    op.drop_column("subject_score_validation_issues", "resolved_by_user_id")
