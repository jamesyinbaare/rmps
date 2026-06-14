"""Add lunch coupon verifications for subject officers.

Revision ID: s5t6u7v8w9x0
Revises: r4d5e6f7a8b9
Create Date: 2026-06-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "s5t6u7v8w9x0"
down_revision: str | Sequence[str] | None = "r4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lunch_coupon_verifications",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examiner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("reference_code", sa.String(length=16), nullable=False),
        sa.Column("verified_by_id", UUID(as_uuid=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "examiner_id",
            name="uq_lunch_coupon_verifications_exam_examiner",
        ),
    )
    op.create_index(
        "ix_lunch_coupon_verifications_examination_id",
        "lunch_coupon_verifications",
        ["examination_id"],
    )
    op.create_index(
        "ix_lunch_coupon_verifications_examiner_id",
        "lunch_coupon_verifications",
        ["examiner_id"],
    )
    op.create_index(
        "ix_lunch_coupon_verifications_verified_by_id",
        "lunch_coupon_verifications",
        ["verified_by_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_lunch_coupon_verifications_verified_by_id", table_name="lunch_coupon_verifications")
    op.drop_index("ix_lunch_coupon_verifications_examiner_id", table_name="lunch_coupon_verifications")
    op.drop_index("ix_lunch_coupon_verifications_examination_id", table_name="lunch_coupon_verifications")
    op.drop_table("lunch_coupon_verifications")
