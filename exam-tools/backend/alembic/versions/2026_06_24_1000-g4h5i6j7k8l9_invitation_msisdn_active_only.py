"""Limit invitation msisdn uniqueness to active (pending) rows.

Revision ID: g4h5i6j7k8l9
Revises: f3a4b5c6d7e8
Create Date: 2026-06-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g4h5i6j7k8l9"
down_revision: str | Sequence[str] | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _expire_duplicate_active_invitations(conn) -> None:
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY msisdn
                        ORDER BY created_at DESC, id
                    ) AS rn
                FROM examiner_invitations
                WHERE msisdn IS NOT NULL
                  AND TRIM(msisdn) <> ''
                  AND status IN ('pending', 'quota_waitlisted')
            )
            UPDATE examiner_invitations
            SET status = 'expired', updated_at = NOW()
            WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )


def upgrade() -> None:
    conn = op.get_bind()
    _expire_duplicate_active_invitations(conn)

    op.drop_index("uq_examiner_invitations_msisdn_global", table_name="examiner_invitations")
    op.create_index(
        "uq_examiner_invitations_msisdn_global",
        "examiner_invitations",
        ["msisdn"],
        unique=True,
        postgresql_where=sa.text(
            "msisdn IS NOT NULL AND status IN ('pending', 'quota_waitlisted')"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_examiner_invitations_msisdn_global", table_name="examiner_invitations")
    op.create_index(
        "uq_examiner_invitations_msisdn_global",
        "examiner_invitations",
        ["msisdn"],
        unique=True,
        postgresql_where=sa.text("msisdn IS NOT NULL"),
    )
