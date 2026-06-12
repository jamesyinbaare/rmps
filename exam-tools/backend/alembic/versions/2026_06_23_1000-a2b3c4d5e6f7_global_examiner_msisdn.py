"""Global unique msisdn on examiners and examiner invitations.

Revision ID: a2b3c4d5e6f7
Revises: z1a2b3c4d5e6
Create Date: 2026-06-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | Sequence[str] | None = "z1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _dedupe_examiners(conn) -> None:
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


def _dedupe_invitations(conn) -> None:
    conn.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    id,
                    msisdn,
                    ROW_NUMBER() OVER (
                        PARTITION BY msisdn
                        ORDER BY created_at DESC
                    ) AS rn
                FROM examiner_invitations
                WHERE msisdn IS NOT NULL AND TRIM(msisdn) <> ''
            )
            DELETE FROM examiner_invitations
            WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            """
        )
    )


def _clear_accepted_invitation_msisdn(conn) -> None:
    conn.execute(
        sa.text(
            """
            UPDATE examiner_invitations
            SET msisdn = NULL
            WHERE status = 'accepted' AND examiner_id IS NOT NULL AND msisdn IS NOT NULL
            """
        )
    )


def upgrade() -> None:
    conn = op.get_bind()
    _dedupe_examiners(conn)
    _dedupe_invitations(conn)
    _clear_accepted_invitation_msisdn(conn)

    op.drop_constraint("uq_examiners_examination_msisdn", "examiners", type_="unique")
    op.drop_index("ix_examiner_invitations_pending_exam_msisdn", table_name="examiner_invitations")

    op.create_index(
        "uq_examiners_msisdn_global",
        "examiners",
        ["msisdn"],
        unique=True,
        postgresql_where=sa.text("msisdn IS NOT NULL"),
    )
    op.create_index(
        "uq_examiner_invitations_msisdn_global",
        "examiner_invitations",
        ["msisdn"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_examiner_invitations_msisdn_global", table_name="examiner_invitations")
    op.drop_index("uq_examiners_msisdn_global", table_name="examiners")

    op.create_index(
        "ix_examiner_invitations_pending_exam_msisdn",
        "examiner_invitations",
        ["examination_id", "msisdn"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_unique_constraint(
        "uq_examiners_examination_msisdn",
        "examiners",
        ["examination_id", "msisdn"],
    )
