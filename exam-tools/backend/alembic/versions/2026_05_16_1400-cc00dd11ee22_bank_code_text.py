"""Widen bank_branches.bank_code to text (varchar 32).

Revision ID: cc00dd11ee22
Revises: aabbccddeeff
Create Date: 2026-05-16 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "cc00dd11ee22"
down_revision: Union[str, Sequence[str], None] = "aabbccddeeff"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "bank_branches",
        "bank_code",
        existing_type=sa.String(length=6),
        type_=sa.String(length=32),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "bank_branches",
        "bank_code",
        existing_type=sa.String(length=32),
        type_=sa.String(length=6),
        existing_nullable=False,
    )
