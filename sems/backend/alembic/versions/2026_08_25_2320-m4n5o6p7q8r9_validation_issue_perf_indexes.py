"""Add partial indexes for validation issue clerk queries.

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2026-08-25 23:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m4n5o6p7q8r9"
down_revision: str | Sequence[str] | None = "l3m4n5o6p7q8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Native PG enum labels are UPPERCASE member names (PENDING/RESOLVED/IGNORED).
    op.create_index(
        "ix_ssvi_pending_unbatched",
        "subject_score_validation_issues",
        ["status", "batch_id"],
        unique=False,
        postgresql_where=sa.text("status = 'PENDING' AND batch_id IS NULL"),
    )
    op.create_index(
        "ix_ssvi_resolved_by_resolved_at",
        "subject_score_validation_issues",
        ["resolved_by_user_id", "resolved_at"],
        unique=False,
        postgresql_where=sa.text("status = 'RESOLVED'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ssvi_resolved_by_resolved_at",
        table_name="subject_score_validation_issues",
    )
    op.drop_index(
        "ix_ssvi_pending_unbatched",
        table_name="subject_score_validation_issues",
    )
