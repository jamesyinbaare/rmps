"""inspector phone identity: posting unique constraint, inspector phone uniqueness, null school_code

Revision ID: e7f8a9b0c1d2
Revises: d4e5f6a7b8c0
Create Date: 2026-05-19

"""

from __future__ import annotations

from typing import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "e7f8a9b0c1d2"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_USER_REF_COLUMNS = [
    ("script_packing_series", "updated_by_id"),
    ("script_packing_series", "verified_by_id"),
    ("script_envelopes", "verified_by_id"),
    ("irregular_script_packing_series", "updated_by_id"),
    ("irregular_script_packing_series", "verified_by_id"),
    ("irregular_script_envelopes", "verified_by_id"),
    ("allocation_runs", "created_by_id"),
    ("exam_documents", "uploaded_by_id"),
    ("question_paper_control", "updated_by_id"),
    ("question_paper_control", "verified_by_id"),
    ("inspector_exam_postings", "inspector_user_id"),
    ("inspector_exam_postings", "created_by_user_id"),
]


def _merge_duplicate_inspector_users(conn: sa.Connection) -> None:
    rows = conn.execute(
        sa.text(
            """
            SELECT phone_number, array_agg(id ORDER BY id) AS ids
            FROM users
            WHERE role = 'INSPECTOR'
              AND phone_number IS NOT NULL
              AND TRIM(phone_number) <> ''
            GROUP BY phone_number
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()
    for row in rows:
        id_list = row[1]
        uids = list(id_list) if id_list is not None else []
        if len(uids) < 2:
            continue
        keeper = uids[0]
        for old_id in uids[1:]:
            for table, col in _USER_REF_COLUMNS:
                conn.execute(
                    sa.text(f"UPDATE {table} SET {col} = :k WHERE {col} = :o"),
                    {"k": keeper, "o": old_id},
                )
            conn.execute(sa.text("DELETE FROM refresh_tokens WHERE user_id = :o"), {"o": old_id})
            conn.execute(sa.text("DELETE FROM users WHERE id = :o"), {"o": old_id})


def _dedupe_inspector_postings(conn: sa.Connection) -> None:
    conn.execute(
        sa.text(
            """
            DELETE FROM inspector_exam_postings a
            USING inspector_exam_postings b
            WHERE a.examination_id = b.examination_id
              AND a.center_id = b.center_id
              AND a.inspector_user_id = b.inspector_user_id
              AND a.subject_scope::text = b.subject_scope::text
              AND a.id::text > b.id::text
            """
        )
    )


def upgrade() -> None:
    conn = op.get_bind()
    assert conn is not None

    _merge_duplicate_inspector_users(conn)
    _dedupe_inspector_postings(conn)

    op.execute(sa.text("UPDATE users SET school_code = NULL WHERE role = 'INSPECTOR'"))

    op.create_unique_constraint(
        "uq_inspector_postings_exam_center_inspector_scope",
        "inspector_exam_postings",
        ["examination_id", "center_id", "inspector_user_id", "subject_scope"],
    )

    op.execute(
        sa.text(
            """
            CREATE UNIQUE INDEX ix_users_unique_phone_inspector ON users (phone_number)
            WHERE role = 'INSPECTOR' AND phone_number IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_unique_phone_inspector"))
    op.drop_constraint(
        "uq_inspector_postings_exam_center_inspector_scope",
        "inspector_exam_postings",
        type_="unique",
    )
