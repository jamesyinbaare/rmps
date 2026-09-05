"""Add SCORE_IMPORT to processtype enum.

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
Create Date: 2026-09-04 21:30:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "p7q8r9s0t1u2"
down_revision: str | Sequence[str] | None = "o6p7q8r9s0t1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE processtype ADD VALUE IF NOT EXISTS 'SCORE_IMPORT'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value.
    pass
