"""Add document subject_changed_from/at for subject reassignment markers.

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
Create Date: 2026-08-27 13:55:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "o6p7q8r9s0t1"
down_revision: str | Sequence[str] | None = "n5o6p7q8r9s0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("subject_changed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("subject_changed_from", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "subject_changed_from")
    op.drop_column("documents", "subject_changed_at")
