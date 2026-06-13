"""Add letter_date to appointment letter settings.

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
Create Date: 2026-06-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "z5a6b7c8d9e0"
down_revision: str | Sequence[str] | None = "y4z5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "examination_examiner_appointment_letter_settings",
        sa.Column("letter_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("examination_examiner_appointment_letter_settings", "letter_date")
