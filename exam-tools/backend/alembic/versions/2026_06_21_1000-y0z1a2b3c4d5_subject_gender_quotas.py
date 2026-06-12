"""Add optional nationwide gender quotas to subject examiner quota settings.

Revision ID: y0z1a2b3c4d5
Revises: x9y0z1a2b3c4
Create Date: 2026-06-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "y0z1a2b3c4d5"
down_revision: str | Sequence[str] | None = "x9y0z1a2b3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("subject_examiner_quota_settings", sa.Column("male_quota", sa.Integer(), nullable=True))
    op.add_column("subject_examiner_quota_settings", sa.Column("female_quota", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_subject_examiner_quota_settings_male_nonneg",
        "subject_examiner_quota_settings",
        "male_quota IS NULL OR male_quota >= 0",
    )
    op.create_check_constraint(
        "ck_subject_examiner_quota_settings_female_nonneg",
        "subject_examiner_quota_settings",
        "female_quota IS NULL OR female_quota >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_subject_examiner_quota_settings_female_nonneg",
        "subject_examiner_quota_settings",
        type_="check",
    )
    op.drop_constraint(
        "ck_subject_examiner_quota_settings_male_nonneg",
        "subject_examiner_quota_settings",
        type_="check",
    )
    op.drop_column("subject_examiner_quota_settings", "female_quota")
    op.drop_column("subject_examiner_quota_settings", "male_quota")
