"""allocation_campaigns: persist scope, cross-marking rules, solver prefs.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-15 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "allocation_campaigns",
        sa.Column("allocation_scope", sa.String(length=16), nullable=False, server_default="zone"),
    )
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "cross_marking_rules",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "allocation_campaigns",
        sa.Column("fairness_weight", sa.Float(), nullable=False, server_default="0.25"),
    )
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "enforce_single_series_per_examiner",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "exclude_home_zone_or_region",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("allocation_campaigns", "exclude_home_zone_or_region")
    op.drop_column("allocation_campaigns", "enforce_single_series_per_examiner")
    op.drop_column("allocation_campaigns", "fairness_weight")
    op.drop_column("allocation_campaigns", "cross_marking_rules")
    op.drop_column("allocation_campaigns", "allocation_scope")
