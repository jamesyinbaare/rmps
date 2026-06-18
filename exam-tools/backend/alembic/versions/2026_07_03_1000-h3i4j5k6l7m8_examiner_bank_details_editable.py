"""Add independent examiner bank details editable toggle.

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h3i4j5k6l7m8"
down_revision: str | Sequence[str] | None = "g2h3i4j5k6l7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "examination_examiner_portal_settings",
        sa.Column(
            "examiner_bank_details_editable_by_examiners",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE examination_examiner_portal_settings
            SET examiner_bank_details_editable_by_examiners = appointment_letters_release_enabled
            """
        )
    )


def downgrade() -> None:
    op.drop_column("examination_examiner_portal_settings", "examiner_bank_details_editable_by_examiners")
