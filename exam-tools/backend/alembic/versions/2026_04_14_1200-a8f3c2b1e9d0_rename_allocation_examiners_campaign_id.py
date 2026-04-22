"""allocation_examiners: rename campaign_id to allocation_id if present.

Revision ID: a8f3c2b1e9d0
Revises: 9c1b2f7d4a10
Create Date: 2026-04-14 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "a8f3c2b1e9d0"
down_revision: Union[str, Sequence[str], None] = "9c1b2f7d4a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'allocation_examiners' "
            "AND column_name = 'campaign_id'"
        )
    ).fetchone()
    if row:
        op.execute(text("ALTER TABLE allocation_examiners RENAME COLUMN campaign_id TO allocation_id"))


def downgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'allocation_examiners' "
            "AND column_name = 'allocation_id'"
        )
    ).fetchone()
    if row:
        op.execute(text("ALTER TABLE allocation_examiners RENAME COLUMN allocation_id TO campaign_id"))
