"""add pricing_model_preference to registration_exams

Revision ID: e8f9a1b2c3d4
Revises: dcad8dd0f290
Create Date: 2024-12-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8f9a1b2c3d4'
down_revision: Union[str, None] = 'dcad8dd0f290'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add pricing_model_preference column to registration_exams
    op.add_column('registration_exams', sa.Column('pricing_model_preference', sa.String(length=20), nullable=True, server_default='auto'))


def downgrade() -> None:
    # Remove pricing_model_preference column
    op.drop_column('registration_exams', 'pricing_model_preference')
