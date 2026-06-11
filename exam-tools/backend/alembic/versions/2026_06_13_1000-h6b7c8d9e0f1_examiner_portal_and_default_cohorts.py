"""Examiner portal tokens, roster source, default cohorts, multi-cohort membership.

Revision ID: h6b7c8d9e0f1
Revises: g5a6b7c8d9e0
Create Date: 2026-06-13

"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "h6b7c8d9e0f1"
down_revision: str | Sequence[str] | None = "g5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_COHORT_NAME = "All examiners"


def _generate_token() -> str:
    return secrets.token_urlsafe(16)


def upgrade() -> None:
    op.execute(
        sa.text(
            "CREATE TYPE examinerrostersource AS ENUM ('manual', 'invitation')"
        )
    )

    op.add_column(
        "examiners",
        sa.Column("portal_token", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "examiners",
        sa.Column(
            "roster_source",
            sa.Enum("manual", "invitation", name="examinerrostersource", create_type=False),
            nullable=True,
        ),
    )

    conn = op.get_bind()

    examiners = conn.execute(
        sa.text(
            """
            SELECT e.id, ei.token AS invitation_token
            FROM examiners e
            LEFT JOIN examiner_invitations ei ON ei.examiner_id = e.id
            """
        )
    ).fetchall()

    used_tokens: set[str] = set()
    used_tokens.update(
        row[0]
        for row in conn.execute(sa.text("SELECT token FROM examiner_invitations")).fetchall()
    )

    for examiner_id, invitation_token in examiners:
        if invitation_token and invitation_token not in used_tokens:
            token = invitation_token
        else:
            token = _generate_token()
            while token in used_tokens:
                token = _generate_token()
        used_tokens.add(token)
        roster_source = "invitation" if invitation_token else "manual"
        conn.execute(
            sa.text(
                """
                UPDATE examiners
                SET portal_token = :token, roster_source = :source
                WHERE id = :id
                """
            ),
            {"token": token, "source": roster_source, "id": examiner_id},
        )

    op.alter_column("examiners", "portal_token", nullable=False)
    op.alter_column("examiners", "roster_source", nullable=False)
    op.create_index("ix_examiners_portal_token", "examiners", ["portal_token"], unique=True)

    op.add_column(
        "subject_marking_groups",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "uq_subject_marking_group_default_per_subject",
        "subject_marking_groups",
        ["examination_id", "subject_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    op.drop_constraint(
        "uq_subject_marking_group_member_per_subject",
        "subject_marking_group_members",
        type_="unique",
    )

    subject_pairs = conn.execute(
        sa.text(
            """
            SELECT DISTINCT es.subject_id, e.examination_id
            FROM examiner_subjects es
            JOIN examiners e ON e.id = es.examiner_id
            """
        )
    ).fetchall()

    for subject_id, examination_id in subject_pairs:
        group_id = uuid.uuid4()
        conn.execute(
            sa.text(
                """
                INSERT INTO subject_marking_groups
                (id, examination_id, subject_id, name, is_default, created_at, updated_at)
                VALUES (:id, :exam_id, :subject_id, :name, true, NOW(), NOW())
                """
            ),
            {
                "id": group_id,
                "exam_id": examination_id,
                "subject_id": subject_id,
                "name": DEFAULT_COHORT_NAME,
            },
        )
        examiner_ids = conn.execute(
            sa.text(
                """
                SELECT e.id
                FROM examiners e
                JOIN examiner_subjects es ON es.examiner_id = e.id
                WHERE e.examination_id = :exam_id AND es.subject_id = :subject_id
                """
            ),
            {"exam_id": examination_id, "subject_id": subject_id},
        ).fetchall()
        for (examiner_id,) in examiner_ids:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO subject_marking_group_members
                    (group_id, examiner_id, examination_id, subject_id, created_at)
                    VALUES (:group_id, :examiner_id, :exam_id, :subject_id, NOW())
                    ON CONFLICT DO NOTHING
                    """
                ),
                {
                    "group_id": group_id,
                    "examiner_id": examiner_id,
                    "exam_id": examination_id,
                    "subject_id": subject_id,
                },
            )

    op.alter_column("subject_marking_groups", "is_default", server_default=None)


def downgrade() -> None:
    op.drop_index("uq_subject_marking_group_default_per_subject", table_name="subject_marking_groups")
    op.drop_column("subject_marking_groups", "is_default")

    op.create_unique_constraint(
        "uq_subject_marking_group_member_per_subject",
        "subject_marking_group_members",
        ["examination_id", "subject_id", "examiner_id"],
    )

    op.drop_index("ix_examiners_portal_token", table_name="examiners")
    op.drop_column("examiners", "roster_source")
    op.drop_column("examiners", "portal_token")
    op.execute(sa.text("DROP TYPE IF EXISTS examinerrostersource"))
