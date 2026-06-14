"""Workforce roster availability confirmation fields.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-06-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c0d1e2f3a4b5"
down_revision: str | Sequence[str] | None = "b9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("script_checkers", "data_entry_clerks"):
        op.add_column(
            table,
            sa.Column(
                "availability_status",
                sa.String(length=16),
                nullable=False,
                server_default="pending",
            ),
        )
        op.add_column(table, sa.Column("availability_responded_at", sa.DateTime(), nullable=True))
        op.add_column(table, sa.Column("availability_deadline", sa.DateTime(), nullable=True))
        op.create_index(f"ix_{table}_availability_status", table, ["availability_status"])
        # Existing roster rows were usable before this flow — treat as already confirmed.
        op.execute(sa.text(f"UPDATE {table} SET availability_status = 'confirmed'"))


def downgrade() -> None:
    for table in ("script_checkers", "data_entry_clerks"):
        op.drop_index(f"ix_{table}_availability_status", table_name=table)
        op.drop_column(table, "availability_deadline")
        op.drop_column(table, "availability_responded_at")
        op.drop_column(table, "availability_status")
