"""Add per-cohort scripts allocation release fields.

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m8n9o0p1q2r3"
down_revision: str | Sequence[str] | None = "l7m8n9o0p1q2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subject_marking_groups",
        sa.Column(
            "scripts_allocation_release_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column("scripts_allocation_release_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subject_marking_groups", "scripts_allocation_release_at")
    op.drop_column("subject_marking_groups", "scripts_allocation_release_enabled")
