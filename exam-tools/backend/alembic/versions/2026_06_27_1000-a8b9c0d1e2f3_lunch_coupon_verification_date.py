"""Add verification_date to lunch coupon verifications (once per day).

Revision ID: a8b9c0d1e2f3
Revises: z6a7b8c9d0e1
Create Date: 2026-06-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a8b9c0d1e2f3"
down_revision: str | Sequence[str] | None = "z6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "lunch_coupon_verifications",
        sa.Column("verification_date", sa.Date(), nullable=True),
    )
    op.execute(
        sa.text(
            "UPDATE lunch_coupon_verifications SET verification_date = verified_at::date WHERE verification_date IS NULL"
        )
    )
    op.alter_column("lunch_coupon_verifications", "verification_date", nullable=False)
    op.drop_constraint(
        "uq_lunch_coupon_verifications_exam_examiner",
        "lunch_coupon_verifications",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_lunch_coupon_verifications_exam_examiner_date",
        "lunch_coupon_verifications",
        ["examination_id", "examiner_id", "verification_date"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_lunch_coupon_verifications_exam_examiner_date",
        "lunch_coupon_verifications",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_lunch_coupon_verifications_exam_examiner",
        "lunch_coupon_verifications",
        ["examination_id", "examiner_id"],
    )
    op.drop_column("lunch_coupon_verifications", "verification_date")
