"""Add decline feedback on invitations and background survey on examiners.

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-06-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "n9o0p1q2r3s4"
down_revision: str | Sequence[str] | None = "m8n9o0p1q2r3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("examiner_invitations", sa.Column("decline_reason", sa.Text(), nullable=True))
    op.add_column(
        "examiner_invitations",
        sa.Column("decline_consider_future_examinations", sa.Boolean(), nullable=True),
    )
    op.add_column("examiners", sa.Column("background_occupation_type", sa.String(length=16), nullable=True))
    op.add_column("examiners", sa.Column("background_institution_name", sa.String(length=255), nullable=True))
    op.add_column("examiners", sa.Column("background_teaching_subject", sa.String(length=255), nullable=True))
    op.add_column("examiners", sa.Column("background_industry", sa.String(length=255), nullable=True))
    op.add_column("examiners", sa.Column("background_specialization", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("examiners", "background_specialization")
    op.drop_column("examiners", "background_industry")
    op.drop_column("examiners", "background_teaching_subject")
    op.drop_column("examiners", "background_institution_name")
    op.drop_column("examiners", "background_occupation_type")
    op.drop_column("examiner_invitations", "decline_consider_future_examinations")
    op.drop_column("examiner_invitations", "decline_reason")
