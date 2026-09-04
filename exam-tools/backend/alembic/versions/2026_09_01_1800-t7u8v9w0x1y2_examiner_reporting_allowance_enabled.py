"""Add reporting_allowance_enabled for special-case AE report allowance.

Revision ID: t7u8v9w0x1y2
Revises: r4s5t6u7v8w9
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t7u8v9w0x1y2"
down_revision: str | Sequence[str] | None = "r4s5t6u7v8w9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "examiners",
        sa.Column("reporting_allowance_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("examiners", "reporting_allowance_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("examiners", "reporting_allowance_enabled")
