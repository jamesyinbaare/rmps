"""Add template to pdf_generation_jobs

Revision ID: a1b2c3d4e5f6
Revises: 44e83c96d408
Create Date: 2026-01-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "44e83c96d408"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pdf_generation_jobs",
        sa.Column("template", sa.String(32), nullable=False, server_default="new"),
    )


def downgrade() -> None:
    op.drop_column("pdf_generation_jobs", "template")
