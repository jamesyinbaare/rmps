"""Add skipped to validation issue status enum.

Revision ID: n5o6p7q8r9s0
Revises: m4n5o6p7q8r9
Create Date: 2026-08-26 00:35:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "n5o6p7q8r9s0"
down_revision: str | Sequence[str] | None = "m4n5o6p7q8r9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ADD VALUE cannot run in the same transaction as later uses of the new label.
    # Native PG enum labels are UPPERCASE member names (PENDING/RESOLVED/IGNORED).
    op.execute("ALTER TYPE validationissuestatus ADD VALUE IF NOT EXISTS 'SKIPPED'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value.
    pass
