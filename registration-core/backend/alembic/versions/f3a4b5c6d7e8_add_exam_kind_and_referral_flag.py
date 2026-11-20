"""Add exam_kind and allows_referral_registration to registration_exams

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-03-19 23:30:00.000000

Backfill rules:
- only private allowed  -> exam_kind=private, allows_referral=false
- only bulk allowed     -> exam_kind=school,  allows_referral=true
- both (or neither)     -> exam_kind=school,  allows_referral=true
- Sync allows_private_registration to match exam_kind after backfill
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registration_exams",
        sa.Column(
            "exam_kind",
            sa.String(length=20),
            nullable=True,
        ),
    )
    op.add_column(
        "registration_exams",
        sa.Column(
            "allows_referral_registration",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # Backfill from registration period flags
    op.execute(
        """
        UPDATE registration_exams re
        SET
            exam_kind = CASE
                WHEN erp.allows_private_registration = true
                     AND erp.allows_bulk_registration = false
                THEN 'private'
                ELSE 'school'
            END,
            allows_referral_registration = CASE
                WHEN erp.allows_private_registration = true
                     AND erp.allows_bulk_registration = false
                THEN false
                ELSE true
            END
        FROM exam_registration_periods erp
        WHERE re.registration_period_id = erp.id
        """
    )

    # Any exams without a period join fall back to school
    op.execute(
        """
        UPDATE registration_exams
        SET exam_kind = 'school'
        WHERE exam_kind IS NULL
        """
    )

    op.alter_column(
        "registration_exams",
        "exam_kind",
        existing_type=sa.String(length=20),
        nullable=False,
        server_default="school",
    )
    op.create_index(
        "ix_registration_exams_exam_kind",
        "registration_exams",
        ["exam_kind"],
        unique=False,
    )

    # Keep allows_private_registration aligned with exam_kind
    op.execute(
        """
        UPDATE exam_registration_periods erp
        SET allows_private_registration = (re.exam_kind = 'private')
        FROM registration_exams re
        WHERE re.registration_period_id = erp.id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_registration_exams_exam_kind", table_name="registration_exams")
    op.drop_column("registration_exams", "allows_referral_registration")
    op.drop_column("registration_exams", "exam_kind")
