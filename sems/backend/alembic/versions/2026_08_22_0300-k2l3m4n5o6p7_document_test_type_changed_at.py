"""Add documents.test_type_changed_at for paper reclassify indicator.

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
Create Date: 2026-08-22 03:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "k2l3m4n5o6p7"
down_revision: str | Sequence[str] | None = "j1k2l3m4n5o6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("test_type_changed_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "test_type_changed_at")
