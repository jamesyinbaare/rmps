"""Payout override uses system marking rate via subject/paper.

Revision ID: r4s5t6u7v8w9
Revises: q3r4s5t6u7v8
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "r4s5t6u7v8w9"
down_revision: str | Sequence[str] | None = "q3r4s5t6u7v8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM examiner_payout_overrides"))
    op.drop_constraint("ck_examiner_payout_override_rate", "examiner_payout_overrides", type_="check")
    op.drop_column("examiner_payout_overrides", "rate_per_script_ghs")
    op.add_column("examiner_payout_overrides", sa.Column("subject_id", sa.Integer(), nullable=False))
    op.add_column(
        "examiner_payout_overrides",
        sa.Column("paper_number", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_foreign_key(
        "fk_examiner_payout_overrides_subject_id",
        "examiner_payout_overrides",
        "subjects",
        ["subject_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_examiner_payout_overrides_subject_id", "examiner_payout_overrides", ["subject_id"])
    op.create_check_constraint(
        "ck_examiner_payout_override_paper_number",
        "examiner_payout_overrides",
        "paper_number >= 1",
    )
    op.alter_column("examiner_payout_overrides", "paper_number", server_default=None)


def downgrade() -> None:
    op.drop_constraint("ck_examiner_payout_override_paper_number", "examiner_payout_overrides", type_="check")
    op.drop_index("ix_examiner_payout_overrides_subject_id", table_name="examiner_payout_overrides")
    op.drop_constraint("fk_examiner_payout_overrides_subject_id", "examiner_payout_overrides", type_="foreignkey")
    op.drop_column("examiner_payout_overrides", "paper_number")
    op.drop_column("examiner_payout_overrides", "subject_id")
    op.add_column(
        "examiner_payout_overrides",
        sa.Column("rate_per_script_ghs", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "ck_examiner_payout_override_rate",
        "examiner_payout_overrides",
        "rate_per_script_ghs >= 0",
    )
    op.alter_column("examiner_payout_overrides", "rate_per_script_ghs", server_default=None)
