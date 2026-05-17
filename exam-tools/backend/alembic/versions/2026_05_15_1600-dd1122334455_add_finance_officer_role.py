"""Add FINANCE_OFFICER to userrole enum.

Revision ID: dd1122334455
Revises: cc00dd11ee22
Create Date: 2026-05-15

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic_postgresql_enum import TableReference

from alembic import op

revision: str = "dd1122334455"
down_revision: str | None = "cc00dd11ee22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_CREATE_INSPECTOR_PHONE_INDEX = """
CREATE UNIQUE INDEX ix_users_unique_phone_inspector ON users (phone_number)
WHERE role = 'INSPECTOR' AND phone_number IS NOT NULL
"""


def upgrade() -> None:
    # Partial index on users.role prevents alembic-postgresql-enum from swapping the enum type.
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


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_unique_phone_inspector"))
    op.sync_enum_values(
        enum_schema="public",
        enum_name="userrole",
        new_values=[
            "SUPER_ADMIN",
            "TEST_ADMIN_OFFICER",
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
