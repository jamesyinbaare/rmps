"""Split inspector submission period into core and elective date ranges.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-05-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "examination_inspector_submission_settings",
        sa.Column("core_submission_period_start", sa.Date(), nullable=True),
    )
    op.add_column(
        "examination_inspector_submission_settings",
        sa.Column("core_submission_period_end", sa.Date(), nullable=True),
    )
    op.add_column(
        "examination_inspector_submission_settings",
        sa.Column("elective_submission_period_start", sa.Date(), nullable=True),
    )
    op.add_column(
        "examination_inspector_submission_settings",
        sa.Column("elective_submission_period_end", sa.Date(), nullable=True),
    )

    op.execute(
        """
        UPDATE examination_inspector_submission_settings
        SET
            core_submission_period_start = submission_period_start,
            core_submission_period_end = submission_period_end,
            elective_submission_period_start = submission_period_start,
            elective_submission_period_end = submission_period_end
        """
    )

    op.drop_column("examination_inspector_submission_settings", "submission_period_start")
    op.drop_column("examination_inspector_submission_settings", "submission_period_end")


def downgrade() -> None:
    op.add_column(
        "examination_inspector_submission_settings",
        sa.Column("submission_period_start", sa.Date(), nullable=True),
    )
    op.add_column(
        "examination_inspector_submission_settings",
        sa.Column("submission_period_end", sa.Date(), nullable=True),
    )

    op.execute(
        """
        UPDATE examination_inspector_submission_settings
        SET
            submission_period_start = core_submission_period_start,
            submission_period_end = core_submission_period_end
        WHERE core_submission_period_start IS NOT NULL
           OR elective_submission_period_start IS NOT NULL
        """
    )

    op.drop_column("examination_inspector_submission_settings", "elective_submission_period_end")
    op.drop_column("examination_inspector_submission_settings", "elective_submission_period_start")
    op.drop_column("examination_inspector_submission_settings", "core_submission_period_end")
    op.drop_column("examination_inspector_submission_settings", "core_submission_period_start")
