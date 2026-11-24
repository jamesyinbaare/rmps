"""Add password_setup_tokens table

Revision ID: n1c2d3e4f5a6
Revises: m0b1c2d3e4f5
Create Date: 2026-11-24 13:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "m0b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_setup_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["portal_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_password_setup_tokens_user_id"),
        "password_setup_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_password_setup_tokens_token_hash"),
        "password_setup_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_password_setup_tokens_purpose"),
        "password_setup_tokens",
        ["purpose"],
        unique=False,
    )
    op.create_index(
        op.f("ix_password_setup_tokens_expires_at"),
        "password_setup_tokens",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_password_setup_tokens_expires_at"), table_name="password_setup_tokens")
    op.drop_index(op.f("ix_password_setup_tokens_purpose"), table_name="password_setup_tokens")
    op.drop_index(op.f("ix_password_setup_tokens_token_hash"), table_name="password_setup_tokens")
    op.drop_index(op.f("ix_password_setup_tokens_user_id"), table_name="password_setup_tokens")
    op.drop_table("password_setup_tokens")
