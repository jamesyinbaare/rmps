"""Store examiner_type as varchar API values on remaining tables.

Revision ID: w2x3y4z5a6b7
Revises: d5e6f7a8c0d1
Create Date: 2026-06-25

The examiners table (and related tables) still used the native PostgreSQL
``examinertype`` enum (CHIEF, ASSISTANT, …). SQLAlchemy bound Python enum
*names* (e.g. ASSISTANT_CHIEF), which PostgreSQL rejected. Convert all
remaining examiner_type columns to VARCHAR API values (chief_examiner, …).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "w2x3y4z5a6b7"
down_revision: str | Sequence[str] | None = "d5e6f7a8c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_EXAMINER_TYPE_TO_API = """
    CASE examiner_type::text
        WHEN 'CHIEF' THEN 'chief_examiner'
        WHEN 'ASSISTANT' THEN 'assistant_examiner'
        WHEN 'TEAM_LEADER' THEN 'team_leader'
        WHEN 'ASSISTANT_CHIEF' THEN 'assistant_chief_examiner'
        ELSE examiner_type::text
    END
"""

_LEGACY_ENUM_LABELS = ("CHIEF", "ASSISTANT", "TEAM_LEADER", "ASSISTANT_CHIEF")

_TABLES = (
    "examiners",
    "examiner_invitations",
    "scripts_allocation_quotas",
    "subject_marking_group_source_roles",
)


def _convert_examiner_type_column(table: str) -> None:
    bind = op.get_bind()
    udt_name = bind.execute(
        sa.text(
            "SELECT udt_name FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND table_name = :table "
            "AND column_name = 'examiner_type'"
        ),
        {"table": table},
    ).scalar()
    if udt_name is None:
        return

    if udt_name == "examinertype":
        op.execute(
            f"""
            ALTER TABLE {table}
            ALTER COLUMN examiner_type TYPE VARCHAR(64)
            USING ({_EXAMINER_TYPE_TO_API})
            """
        )
        return

    labels = ", ".join(f"'{label}'" for label in _LEGACY_ENUM_LABELS)
    op.execute(
        f"""
        UPDATE {table}
        SET examiner_type = ({_EXAMINER_TYPE_TO_API})
        WHERE examiner_type IN ({labels})
        """
    )


def _drop_examinertype_if_unused() -> None:
    bind = op.get_bind()
    remaining = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = 'public' AND udt_name = 'examinertype'"
        )
    ).scalar()
    if remaining == 0:
        op.execute("DROP TYPE IF EXISTS examinertype")


def upgrade() -> None:
    for table in _TABLES:
        _convert_examiner_type_column(table)
    _drop_examinertype_if_unused()


def downgrade() -> None:
    pass
