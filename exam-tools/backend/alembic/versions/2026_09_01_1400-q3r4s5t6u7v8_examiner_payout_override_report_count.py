"""Examiner payout overrides and CE report count.

Revision ID: q3r4s5t6u7v8
Revises: p2q3r4s5t6u7
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q3r4s5t6u7v8"
down_revision: str | Sequence[str] | None = "p2q3r4s5t6u7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE examinerrostersource ADD VALUE IF NOT EXISTS 'payout_override'"))

    op.add_column(
        "examiners",
        sa.Column("chief_examiners_report_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_check_constraint(
        "ck_examiner_chief_examiners_report_count",
        "examiners",
        "chief_examiners_report_count >= 1",
    )

    op.create_table(
        "examiner_payout_overrides",
        sa.Column("examiner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("script_count", sa.Integer(), nullable=False),
        sa.Column("rate_per_script_ghs", sa.Numeric(12, 2), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examiner_id"),
        sa.CheckConstraint("script_count >= 0", name="ck_examiner_payout_override_script_count"),
        sa.CheckConstraint("rate_per_script_ghs >= 0", name="ck_examiner_payout_override_rate"),
    )


def downgrade() -> None:
    op.drop_table("examiner_payout_overrides")
    op.drop_constraint("ck_examiner_chief_examiners_report_count", "examiners", type_="check")
    op.drop_column("examiners", "chief_examiners_report_count")
