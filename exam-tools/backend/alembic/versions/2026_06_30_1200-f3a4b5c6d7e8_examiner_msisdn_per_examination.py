"""Revert examiner msisdn uniqueness to per examination.

Revision ID: f3a4b5c6d7e8
Revises: p1q2r3s4t5u6
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "p1q2r3s4t5u6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _dedupe_examiners_per_examination(conn) -> None:
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    e.id,
                    ROW_NUMBER() OVER (
                        PARTITION BY e.examination_id, e.msisdn
                        ORDER BY e.created_at DESC, e.id
                    ) AS rn
                FROM examiners e
                WHERE e.msisdn IS NOT NULL AND TRIM(e.msisdn) <> ''
            )
            UPDATE examiners
            SET msisdn = NULL, phone_number = NULL
            WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )


def upgrade() -> None:
    conn = op.get_bind()
    _dedupe_examiners_per_examination(conn)

    op.drop_index("uq_examiners_msisdn_global", table_name="examiners")

    op.create_index(
        "uq_examiners_examination_msisdn",
        "examiners",
        ["examination_id", "msisdn"],
        unique=True,
        postgresql_where=sa.text("msisdn IS NOT NULL"),
    )


def downgrade() -> None:
    conn = op.get_bind()

    op.drop_index("uq_examiners_examination_msisdn", table_name="examiners")

    conn.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    e.id,
                    e.msisdn,
                    ROW_NUMBER() OVER (
                        PARTITION BY e.msisdn
                        ORDER BY ex.created_at DESC NULLS LAST, e.created_at DESC
                    ) AS rn
                FROM examiners e
                JOIN examinations ex ON ex.id = e.examination_id
                WHERE e.msisdn IS NOT NULL AND TRIM(e.msisdn) <> ''
            )
            UPDATE examiners
            SET msisdn = NULL, phone_number = NULL
            WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )

    op.create_index(
        "uq_examiners_msisdn_global",
        "examiners",
        ["msisdn"],
        unique=True,
        postgresql_where=sa.text("msisdn IS NOT NULL"),
    )
