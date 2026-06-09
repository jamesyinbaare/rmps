"""Marked script returns keyed by allocation assignment (per envelope).

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-06-08

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b0c1d2e3f4a5"
down_revision: str | Sequence[str] | None = "a9b0c1d2e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM examiner_marked_script_returns"))
    op.drop_constraint("uq_examiner_marked_script_return", "examiner_marked_script_returns", type_="unique")
    op.add_column(
        "examiner_marked_script_returns",
        sa.Column("allocation_assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_foreign_key(
        "fk_examiner_marked_script_returns_allocation_assignment_id",
        "examiner_marked_script_returns",
        "allocation_assignments",
        ["allocation_assignment_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_examiner_marked_script_returns_allocation_assignment_id",
        "examiner_marked_script_returns",
        ["allocation_assignment_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_examiner_marked_script_returns_allocation_assignment_id",
        table_name="examiner_marked_script_returns",
    )
    op.drop_constraint(
        "fk_examiner_marked_script_returns_allocation_assignment_id",
        "examiner_marked_script_returns",
        type_="foreignkey",
    )
    op.drop_column("examiner_marked_script_returns", "allocation_assignment_id")
    op.create_unique_constraint(
        "uq_examiner_marked_script_return",
        "examiner_marked_script_returns",
        ["examination_id", "subject_id", "examiner_id", "paper_number", "allocation_run_id"],
    )
