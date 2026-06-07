"""examiner invitation coordination_date

Revision ID: f6a7b0c1d2e3
Revises: e5f6a7b0c1d2
Create Date: 2026-06-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b0c1d2e3"
down_revision: Union[str, None] = "e5f6a7b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "examiner_invitations",
        sa.Column("coordination_date", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("examiner_invitations", "coordination_date")
