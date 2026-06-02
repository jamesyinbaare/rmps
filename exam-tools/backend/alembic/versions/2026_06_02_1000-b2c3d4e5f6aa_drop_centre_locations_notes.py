"""Drop notes from centre_locations.

Revision ID: b2c3d4e5f6aa
Revises: a1b2c3d4e5f9
Create Date: 2026-06-02

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6aa"
down_revision: Union[str, None] = "a1b2c3d4e5f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "centre_locations" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("centre_locations")}
    if "notes" in cols:
        op.drop_column("centre_locations", "notes")


def downgrade() -> None:
    op.add_column("centre_locations", sa.Column("notes", sa.Text(), nullable=True))
