"""Add scores applied tracking columns to documents.

Revision ID: b8c9d0e1f2a3
Revises: a9b0c1d2e3f4
Create Date: 2026-08-09 17:10:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | Sequence[str] | None = "a9b0c1d2e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("scores_applied_at", sa.DateTime(), nullable=True))
    op.add_column("documents", sa.Column("scores_applied_count", sa.Integer(), nullable=True))
    op.add_column("documents", sa.Column("scores_unmatched_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "scores_unmatched_count")
    op.drop_column("documents", "scores_applied_count")
    op.drop_column("documents", "scores_applied_at")
