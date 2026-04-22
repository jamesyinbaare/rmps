"""rename examiner home fields to region/zone.

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-04-14 17:30:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("examiners") as batch_op:
        batch_op.alter_column("home_region", new_column_name="region")
        batch_op.alter_column("home_zone", new_column_name="zone")


def downgrade() -> None:
    with op.batch_alter_table("examiners") as batch_op:
        batch_op.alter_column("zone", new_column_name="home_zone")
        batch_op.alter_column("region", new_column_name="home_region")
