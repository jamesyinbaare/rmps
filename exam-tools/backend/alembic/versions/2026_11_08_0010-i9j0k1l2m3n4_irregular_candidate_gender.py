"""Add required gender to irregular examination candidates.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-11-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "i9j0k1l2m3n4"
down_revision: str | Sequence[str] | None = "h8i9j0k1l2m3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "irregular_examination_candidates",
        sa.Column("gender", sa.String(length=20), nullable=True),
    )
    op.execute(
        "UPDATE irregular_examination_candidates SET gender = 'Male' WHERE gender IS NULL"
    )
    op.alter_column(
        "irregular_examination_candidates",
        "gender",
        existing_type=sa.String(length=20),
        nullable=False,
    )
    op.create_check_constraint(
        "ck_irregular_candidate_gender",
        "irregular_examination_candidates",
        "gender IN ('Male', 'Female')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_irregular_candidate_gender",
        "irregular_examination_candidates",
        type_="check",
    )
    op.drop_column("irregular_examination_candidates", "gender")
