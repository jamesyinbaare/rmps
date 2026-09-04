"""Enable special examiner role allowances by default.

Revision ID: x1y2z3a4b5c6
Revises: w0x1y2z3a4b5
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "x1y2z3a4b5c6"
down_revision: str | Sequence[str] | None = "w0x1y2z3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Flip previously saved special-row eligibility to match the new defaults.
    op.execute(
        sa.text(
            """
            UPDATE examination_roster_allowance_eligibility
            SET enabled = true, updated_at = NOW()
            WHERE roster_source IN ('special', 'payout_override')
              AND allowance_key IN (
                'responsibility',
                'inconvenience',
                'chief_examiners_report',
                'marking'
              )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE examination_roster_allowance_eligibility
            SET enabled = false, updated_at = NOW()
            WHERE roster_source IN ('special', 'payout_override')
              AND allowance_key IN (
                'responsibility',
                'inconvenience',
                'chief_examiners_report'
              )
            """
        )
    )
