"""Extend school code to 15 characters (schools.code, users.school_code).

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-04-11

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: str | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "schools",
        "code",
        existing_type=sa.String(length=6),
        type_=sa.String(length=15),
        existing_nullable=False,
    )
    op.alter_column(
        "users",
        "school_code",
        existing_type=sa.String(length=10),
        type_=sa.String(length=15),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "school_code",
        existing_type=sa.String(length=15),
        type_=sa.String(length=10),
        existing_nullable=True,
    )
    op.alter_column(
        "schools",
        "code",
        existing_type=sa.String(length=15),
        type_=sa.String(length=6),
        existing_nullable=False,
    )
