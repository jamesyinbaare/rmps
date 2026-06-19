"""Allow null msisdn on accepted examiner invitations.

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "i4j5k6l7m8n9"
down_revision: str | Sequence[str] | None = "h3i4j5k6l7m8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "examiner_invitations",
        "msisdn",
        existing_type=sa.String(length=20),
        nullable=True,
    )
    op.drop_index("uq_examiner_invitations_msisdn_global", table_name="examiner_invitations")
    op.create_index(
        "uq_examiner_invitations_msisdn_global",
        "examiner_invitations",
        ["msisdn"],
        unique=True,
        postgresql_where=sa.text("msisdn IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_examiner_invitations_msisdn_global", table_name="examiner_invitations")
    op.create_index(
        "uq_examiner_invitations_msisdn_global",
        "examiner_invitations",
        ["msisdn"],
        unique=True,
    )
    op.alter_column(
        "examiner_invitations",
        "msisdn",
        existing_type=sa.String(length=20),
        nullable=False,
    )
