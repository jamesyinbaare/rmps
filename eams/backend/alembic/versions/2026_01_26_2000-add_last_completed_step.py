"""Add last_completed_step to examiner_applications

Revision ID: a1b2c3d4e5f6
Revises: 0f8b93803cec
Create Date: 2026-01-26 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "0f8b93803cec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "examiner_applications",
        sa.Column("last_completed_step", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_examiner_applications_last_completed_step"),
        "examiner_applications",
        ["last_completed_step"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_examiner_applications_last_completed_step"),
        table_name="examiner_applications",
    )
    op.drop_column("examiner_applications", "last_completed_step")
