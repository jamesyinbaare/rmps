"""Add optional gender to examiners and examiner invitations.

Revision ID: x9y0z1a2b3c4
Revises: v8w9x0y1z2a3
Create Date: 2026-06-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "x9y0z1a2b3c4"
down_revision: str | Sequence[str] | None = "v8w9x0y1z2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("examiners", sa.Column("gender", sa.String(length=20), nullable=True))
    op.add_column("examiner_invitations", sa.Column("gender", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("examiner_invitations", "gender")
    op.drop_column("examiners", "gender")
