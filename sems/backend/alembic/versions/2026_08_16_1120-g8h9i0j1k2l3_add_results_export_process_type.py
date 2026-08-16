"""Add RESULTS_EXPORT to processtype enum.

Revision ID: g8h9i0j1k2l3
Revises: f7a8b9c0d1e2
Create Date: 2026-08-16 11:20:00.000000

"""
from collections.abc import Sequence

from alembic import op

revision: str = "g8h9i0j1k2l3"
down_revision: str | Sequence[str] | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ADD VALUE cannot be used later in the same transaction; this migration
    # only adds the label. IF NOT EXISTS keeps compose-watch / re-runs safe.
    op.execute("ALTER TYPE processtype ADD VALUE IF NOT EXISTS 'RESULTS_EXPORT'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value.
    pass
