"""Add score_import_staging table for set-based score apply.

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2026-09-05 11:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "q8r9s0t1u2v3"
down_revision: str | Sequence[str] | None = "p7q8r9s0t1u2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "score_import_staging",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("job_key", sa.String(length=64), nullable=False),
        sa.Column("row_num", sa.Integer(), nullable=False),
        sa.Column("subject_registration_id", sa.Integer(), nullable=True),
        sa.Column("subject_score_id", sa.Integer(), nullable=True),
        sa.Column("parsed_score", sa.String(length=10), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="ready"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_score_import_staging_job_key",
        "score_import_staging",
        ["job_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_score_import_staging_job_key", table_name="score_import_staging")
    op.drop_table("score_import_staging")
