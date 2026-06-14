"""Add commute, lunch, and withholding tax to workforce rates.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e2f3a4b5c6d7"
down_revision: str | Sequence[str] | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RATE_TABLES = (
    "examination_script_checker_rates",
    "examination_data_entry_clerk_rates",
)


def _add_allowance_columns(table: str) -> None:
    op.add_column(
        table,
        sa.Column(
            "commuting_allowance_ghs",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        table,
        sa.Column(
            "lunch_allowance_ghs",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        table,
        sa.Column(
            "withholding_tax_percent",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="10",
        ),
    )
    op.create_check_constraint(
        f"ck_{table}_commuting_nonneg",
        table,
        "commuting_allowance_ghs >= 0",
    )
    op.create_check_constraint(
        f"ck_{table}_lunch_nonneg",
        table,
        "lunch_allowance_ghs >= 0",
    )
    op.create_check_constraint(
        f"ck_{table}_tax_percent_range",
        table,
        "withholding_tax_percent >= 0 AND withholding_tax_percent <= 100",
    )


def _drop_allowance_columns(table: str) -> None:
    op.drop_constraint(f"ck_{table}_tax_percent_range", table, type_="check")
    op.drop_constraint(f"ck_{table}_lunch_nonneg", table, type_="check")
    op.drop_constraint(f"ck_{table}_commuting_nonneg", table, type_="check")
    op.drop_column(table, "withholding_tax_percent")
    op.drop_column(table, "lunch_allowance_ghs")
    op.drop_column(table, "commuting_allowance_ghs")


def upgrade() -> None:
    for table in _RATE_TABLES:
        _add_allowance_columns(table)


def downgrade() -> None:
    for table in reversed(_RATE_TABLES):
        _drop_allowance_columns(table)
