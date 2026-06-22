"""Add cross_marking_override on allocation assignments for manual overrides.

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p1q2r3s4t5u6"
down_revision: str | Sequence[str] | None = "o0p1q2r3s4t5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "allocation_assignments",
        sa.Column(
            "cross_marking_override",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("allocation_assignments", "cross_marking_override")
