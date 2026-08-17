"""Add nullable num_days to workforce assignment batches.

Revision ID: o1p2q3r4s5t6
Revises: n0o1p2q3r4s5
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "o1p2q3r4s5t6"
down_revision: str | Sequence[str] | None = "n0o1p2q3r4s5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "script_checker_assignment_batches",
        sa.Column("num_days", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        "ck_script_checker_batches_num_days",
        "script_checker_assignment_batches",
        "num_days IS NULL OR num_days >= 1",
    )
    op.add_column(
        "data_entry_clerk_assignment_batches",
        sa.Column("num_days", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        "ck_data_entry_clerk_batches_num_days",
        "data_entry_clerk_assignment_batches",
        "num_days IS NULL OR num_days >= 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_data_entry_clerk_batches_num_days",
        "data_entry_clerk_assignment_batches",
        type_="check",
    )
    op.drop_column("data_entry_clerk_assignment_batches", "num_days")
    op.drop_constraint(
        "ck_script_checker_batches_num_days",
        "script_checker_assignment_batches",
        type_="check",
    )
    op.drop_column("script_checker_assignment_batches", "num_days")
