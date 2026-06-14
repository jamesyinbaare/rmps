"""Add valediction to appointment letter settings.

Revision ID: y4z5a6b7c8d9
Revises: x3y4z5a6b7c8
Create Date: 2026-06-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "y4z5a6b7c8d9"
down_revision: str | Sequence[str] | None = "x3y4z5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "examination_examiner_appointment_letter_settings",
        sa.Column(
            "valediction",
            sa.String(length=255),
            nullable=False,
            server_default="Yours faithfully",
        ),
    )


def downgrade() -> None:
    op.drop_column("examination_examiner_appointment_letter_settings", "valediction")
