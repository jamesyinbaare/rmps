"""Add EXECUTIVE_VIEWER to userrole enum.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a9
Create Date: 2026-05-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic_postgresql_enum import TableReference

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CREATE_INSPECTOR_PHONE_INDEX = """
CREATE UNIQUE INDEX ix_users_unique_phone_inspector ON users (phone_number)
WHERE role = 'INSPECTOR' AND phone_number IS NOT NULL
"""


def upgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_unique_phone_inspector"))
    op.sync_enum_values(
        enum_schema="public",
        enum_name="userrole",
        new_values=[
            "SUPER_ADMIN",
            "TEST_ADMIN_OFFICER",
            "FINANCE_OFFICER",
            "EXECUTIVE_VIEWER",
            "SUPERVISOR",
            "INSPECTOR",
            "DEPOT_KEEPER",
        ],
        affected_columns=[
            TableReference(table_schema="public", table_name="users", column_name="role"),
        ],
        enum_values_to_rename=[],
    )
    op.execute(sa.text(_CREATE_INSPECTOR_PHONE_INDEX))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_unique_phone_inspector"))
    op.sync_enum_values(
        enum_schema="public",
        enum_name="userrole",
        new_values=[
            "SUPER_ADMIN",
            "TEST_ADMIN_OFFICER",
            "FINANCE_OFFICER",
            "SUPERVISOR",
            "INSPECTOR",
            "DEPOT_KEEPER",
        ],
        affected_columns=[
            TableReference(table_schema="public", table_name="users", column_name="role"),
        ],
        enum_values_to_rename=[],
    )
    op.execute(sa.text(_CREATE_INSPECTOR_PHONE_INDEX))
