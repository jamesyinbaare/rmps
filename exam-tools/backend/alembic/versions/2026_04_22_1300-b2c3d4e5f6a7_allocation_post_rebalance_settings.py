"""allocation_campaigns: persist post-rebalance settings.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f7
Create Date: 2026-04-22 13:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "enable_post_rebalance",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "rebalance_tolerance_booklets",
            sa.Integer(),
            nullable=False,
            server_default="20",
        ),
    )


def downgrade() -> None:
    op.drop_column("allocation_campaigns", "rebalance_tolerance_booklets")
    op.drop_column("allocation_campaigns", "enable_post_rebalance")
