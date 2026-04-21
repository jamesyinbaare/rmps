"""allocation_campaigns: persist solve_mode (monolithic vs decomposed).

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-21 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "solve_mode",
            sa.String(length=16),
            nullable=False,
            server_default="monolithic",
        ),
    )


def downgrade() -> None:
    op.drop_column("allocation_campaigns", "solve_mode")
