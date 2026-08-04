"""Add app_settings singleton for clerk digital entry toggle.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-08-03 18:45:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: str | Sequence[str] | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "clerk_digital_entry_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column(
            "updated_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO app_settings (id, clerk_digital_entry_enabled, updated_at, updated_by_user_id)
            VALUES (1, false, NOW() AT TIME ZONE 'utc', NULL)
            """
        )
    )


def downgrade() -> None:
    op.drop_table("app_settings")
