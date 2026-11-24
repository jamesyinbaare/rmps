"""Phase 2 auth: account events + refresh token_lookup

Revision ID: p3e4f5a6b7c8
Revises: o2d3e4f5a6b7
Create Date: 2026-11-24 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "p3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "o2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("token_lookup", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_refresh_tokens_token_lookup"),
        "refresh_tokens",
        ["token_lookup"],
        unique=True,
    )

    op.create_table(
        "portal_account_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("target_user_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("metadata", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["portal_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_user_id"], ["portal_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_portal_account_events_actor_user_id"),
        "portal_account_events",
        ["actor_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portal_account_events_target_user_id"),
        "portal_account_events",
        ["target_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portal_account_events_action"),
        "portal_account_events",
        ["action"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portal_account_events_created_at"),
        "portal_account_events",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_portal_account_events_created_at"), table_name="portal_account_events")
    op.drop_index(op.f("ix_portal_account_events_action"), table_name="portal_account_events")
    op.drop_index(op.f("ix_portal_account_events_target_user_id"), table_name="portal_account_events")
    op.drop_index(op.f("ix_portal_account_events_actor_user_id"), table_name="portal_account_events")
    op.drop_table("portal_account_events")
    op.drop_index(op.f("ix_refresh_tokens_token_lookup"), table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "token_lookup")
