"""Add region cross-marking rules and marking region solve order on allocations.

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-06-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "o0p1q2r3s4t5"
down_revision: str | Sequence[str] | None = "n9o0p1q2r3s4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "cross_marking_region_rules",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "allocation_campaigns",
        sa.Column(
            "marking_region_solve_order",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("allocation_campaigns", "marking_region_solve_order")
    op.drop_column("allocation_campaigns", "cross_marking_region_rules")
