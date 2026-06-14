"""Single flat rate per examination for workforce payout.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: str | Sequence[str] | None = "c0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _flatten_rate_table(old_table: str, new_table: str) -> None:
    op.create_table(
        new_table,
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("rate_per_script_ghs", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("rate_per_script_ghs >= 0", name=f"ck_{new_table}_nonneg"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id"),
    )
    op.execute(
        sa.text(
            f"""
            INSERT INTO {new_table} (examination_id, rate_per_script_ghs, updated_at)
            SELECT examination_id, MAX(rate_per_script_ghs), MAX(updated_at)
            FROM {old_table}
            GROUP BY examination_id
            """
        )
    )
    op.drop_table(old_table)
    op.rename_table(new_table, old_table)


def upgrade() -> None:
    _flatten_rate_table(
        "examination_script_checker_rates",
        "examination_script_checker_rates_flat",
    )
    _flatten_rate_table(
        "examination_data_entry_clerk_rates",
        "examination_data_entry_clerk_rates_flat",
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for workforce flat rates.")
