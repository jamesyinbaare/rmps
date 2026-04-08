"""Per-envelope verification for script packing (depot keeper).

Revision ID: c9d0e1f2a3b4
Revises: b8c1d2e3f4a5
Create Date: 2026-04-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("script_envelopes", sa.Column("verified_at", sa.DateTime(), nullable=True))
    op.add_column("script_envelopes", sa.Column("verified_by_id", sa.UUID(), nullable=True))
    op.create_index(
        op.f("ix_script_envelopes_verified_by_id"),
        "script_envelopes",
        ["verified_by_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_script_envelopes_verified_by_id_users",
        "script_envelopes",
        "users",
        ["verified_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Backfill: when a series was already verified, mark every envelope as verified.
    op.execute(
        """
        UPDATE script_envelopes e
        SET verified_at = s.verified_at,
            verified_by_id = s.verified_by_id
        FROM script_packing_series s
        WHERE e.packing_series_id = s.id
          AND s.verified_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_script_envelopes_verified_by_id_users", "script_envelopes", type_="foreignkey")
    op.drop_index(op.f("ix_script_envelopes_verified_by_id"), table_name="script_envelopes")
    op.drop_column("script_envelopes", "verified_by_id")
    op.drop_column("script_envelopes", "verified_at")
