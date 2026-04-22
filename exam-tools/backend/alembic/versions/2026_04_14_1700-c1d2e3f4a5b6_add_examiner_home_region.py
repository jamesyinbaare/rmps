"""add examiner home_region field.

Revision ID: c1d2e3f4a5b6
Revises: b7c4d5e6f7a8
Create Date: 2026-04-14 17:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b7c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "examiners",
        sa.Column("home_region", sa.Enum(name="region", create_constraint=False), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("examiners", "home_region")
