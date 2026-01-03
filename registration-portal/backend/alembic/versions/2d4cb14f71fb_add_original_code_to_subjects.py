"""add_original_code_to_subjects

Revision ID: 2d4cb14f71fb
Revises: 46a1da573f2b
Create Date: 2026-01-02 16:52:35.356870

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2d4cb14f71fb'
down_revision: Union[str, Sequence[str], None] = '46a1da573f2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('subjects', sa.Column('original_code', sa.String(length=50), nullable=True))
    op.create_index(op.f('ix_subjects_original_code'), 'subjects', ['original_code'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_subjects_original_code'), table_name='subjects')
    op.drop_column('subjects', 'original_code')
