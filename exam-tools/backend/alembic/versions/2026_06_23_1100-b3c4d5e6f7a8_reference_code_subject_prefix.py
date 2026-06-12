"""Widen examiner reference_code for subject-prefixed format.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | Sequence[str] | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "examiners",
        "reference_code",
        existing_type=sa.String(length=16),
        type_=sa.String(length=32),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "examiners",
        "reference_code",
        existing_type=sa.String(length=32),
        type_=sa.String(length=16),
        existing_nullable=True,
    )
