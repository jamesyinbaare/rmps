"""Add documents.test_type_changed_from for paper transition display.

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-08-22 09:06:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "l3m4n5o6p7q8"
down_revision: str | Sequence[str] | None = "k2l3m4n5o6p7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("test_type_changed_from", sa.String(length=1), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "test_type_changed_from")
