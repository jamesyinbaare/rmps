"""add_is_private_examination_center_to_schools

Revision ID: add_private_exam_center
Revises: 2d4cb14f71fb
Create Date: 2026-01-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_private_exam_center'
down_revision: Union[str, Sequence[str], None] = '2d4cb14f71fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('schools', sa.Column('is_private_examination_center', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('schools', 'is_private_examination_center')
