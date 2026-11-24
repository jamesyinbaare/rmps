"""Add portal_users.username (required, unique)

Revision ID: o2d3e4f5a6b7
Revises: n1c2d3e4f5a6
Create Date: 2026-11-24 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "n1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("portal_users", sa.Column("username", sa.String(length=255), nullable=True))
    op.execute("UPDATE portal_users SET username = lower(email) WHERE username IS NULL")
    op.alter_column("portal_users", "username", existing_type=sa.String(length=255), nullable=False)
    op.create_index(op.f("ix_portal_users_username"), "portal_users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_portal_users_username"), table_name="portal_users")
    op.drop_column("portal_users", "username")
