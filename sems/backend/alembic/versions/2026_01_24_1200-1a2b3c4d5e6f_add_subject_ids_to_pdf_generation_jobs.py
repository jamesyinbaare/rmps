"""add subject_ids to pdf_generation_jobs

Revision ID: 1a2b3c4d5e6f
Revises: 5b14bf70bd7c
Create Date: 2026-01-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1a2b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "5b14bf70bd7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("pdf_generation_jobs", sa.Column("subject_ids", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("pdf_generation_jobs", "subject_ids")
