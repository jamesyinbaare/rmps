"""Add town and GhanaPost GPS address to examiners.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-07-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "k6l7m8n9o0p1"
down_revision: str | Sequence[str] | None = "j5k6l7m8n9o0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("examiners", sa.Column("town", sa.String(length=255), nullable=True))
    op.add_column("examiners", sa.Column("ghanapost_gps_address", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("examiners", "ghanapost_gps_address")
    op.drop_column("examiners", "town")
