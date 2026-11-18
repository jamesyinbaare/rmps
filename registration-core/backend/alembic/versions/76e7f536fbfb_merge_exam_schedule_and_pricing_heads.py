"""merge_exam_schedule_and_pricing_heads

Revision ID: 76e7f536fbfb
Revises: 52de03ff3bed, e8f9a1b2c3d4
Create Date: 2026-01-12 01:15:43.941857

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '76e7f536fbfb'
down_revision: Union[str, Sequence[str], None] = ('52de03ff3bed', 'e8f9a1b2c3d4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
