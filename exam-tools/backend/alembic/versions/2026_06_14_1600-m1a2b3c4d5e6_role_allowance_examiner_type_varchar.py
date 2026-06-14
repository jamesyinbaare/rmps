"""Ensure role allowance examiner_type is varchar (API values).

Revision ID: m1a2b3c4d5e6
Revises: l0f1a2b3c4d5
Create Date: 2026-06-14

Follow-up for databases that applied the earlier l0 revision that converted
examiner_type to the PostgreSQL examinertype enum.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "l0f1a2b3c4d5"
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


def upgrade() -> None:
    bind = op.get_bind()
    udt_name = bind.execute(
        sa.text(
            "SELECT udt_name FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND table_name = 'examination_examiner_role_allowance_rates' "
            "AND column_name = 'examiner_type'"
        )
    ).scalar()
    if udt_name is None:
        return

    if udt_name == "examinertype":
        op.execute(
            f"""
            ALTER TABLE examination_examiner_role_allowance_rates
            ALTER COLUMN examiner_type TYPE VARCHAR(64)
            USING ({_EXAMINER_TYPE_TO_API})
            """
        )
    else:
        op.execute(
            f"""
            UPDATE examination_examiner_role_allowance_rates
            SET examiner_type = ({_EXAMINER_TYPE_TO_API})
            WHERE examiner_type IN (
                'CHIEF', 'ASSISTANT', 'TEAM_LEADER', 'ASSISTANT_CHIEF'
            )
            """
        )


def downgrade() -> None:
    pass
