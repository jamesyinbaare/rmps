"""One active SchoolAdmin per school: data collapse + partial unique index

Revision ID: q4f5a6b7c8d9
Revises: p3e4f5a6b7c8
Create Date: 2026-11-24 22:40:00.000000

"""
from typing import Sequence, Union
import json
import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision: str = "q4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "p3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Keep oldest active SchoolAdmin per school; deactivate the rest.
    rows = conn.execute(
        sa.text(
            """
            SELECT id, school_id, created_at
            FROM portal_users
            WHERE role = 'SchoolAdmin'
              AND is_active IS TRUE
              AND school_id IS NOT NULL
            ORDER BY school_id ASC, created_at ASC NULLS LAST, id ASC
            """
        )
    ).fetchall()

    seen_schools: set[int] = set()
    deactivate_ids: list = []
    for row in rows:
        school_id = row.school_id
        if school_id in seen_schools:
            deactivate_ids.append(row.id)
        else:
            seen_schools.add(school_id)

    now = datetime.utcnow()
    for user_id in deactivate_ids:
        conn.execute(
            sa.text(
                """
                UPDATE portal_users
                SET is_active = FALSE, updated_at = :now
                WHERE id = :id
                """
            ),
            {"id": user_id, "now": now},
        )
        conn.execute(
            sa.text(
                """
                INSERT INTO portal_account_events (
                    id, actor_user_id, target_user_id, action, metadata, created_at
                ) VALUES (
                    :id, NULL, :target_user_id, :action, :metadata, :created_at
                )
                """
            ),
            {
                "id": uuid.uuid4(),
                "target_user_id": user_id,
                "action": "user.deactivated",
                "metadata": json.dumps({"reason": "one_admin_enforcement"}),
                "created_at": now,
            },
        )

    # Hard guarantee: at most one active SchoolAdmin per school.
    # role is stored as VARCHAR enum name (e.g. 'SchoolAdmin'), not the IntEnum value.
    op.execute(
        sa.text(
            """
            CREATE UNIQUE INDEX uq_one_active_school_admin
            ON portal_users (school_id)
            WHERE role = 'SchoolAdmin'
              AND is_active IS TRUE
              AND school_id IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_one_active_school_admin"))
