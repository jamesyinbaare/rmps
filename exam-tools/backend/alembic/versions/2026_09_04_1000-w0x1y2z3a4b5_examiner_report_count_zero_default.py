"""Allow examiner report_count >= 0; AE default backfill to 0.

Revision ID: w0x1y2z3a4b5
Revises: v9w0x1y2z3a4
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "w0x1y2z3a4b5"
down_revision: str | Sequence[str] | None = "v9w0x1y2z3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_examiner_chief_examiners_report_count", "examiners", type_="check")

    # AEs that still have the old universal default of 1 and never opted into reporting
    # become 0 under the new role default.
    op.execute(
        sa.text(
            """
            UPDATE examiners
            SET chief_examiners_report_count = 0
            WHERE examiner_type = 'assistant_examiner'
              AND chief_examiners_report_count = 1
              AND reporting_allowance_enabled IS NOT TRUE
            """
        )
    )

    op.create_check_constraint(
        "ck_examiner_chief_examiners_report_count",
        "examiners",
        "chief_examiners_report_count >= 0",
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE examiners
            SET chief_examiners_report_count = 1
            WHERE chief_examiners_report_count < 1
            """
        )
    )
    op.drop_constraint("ck_examiner_chief_examiners_report_count", "examiners", type_="check")
    op.create_check_constraint(
        "ck_examiner_chief_examiners_report_count",
        "examiners",
        "chief_examiners_report_count >= 1",
    )
