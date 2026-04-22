"""Add TEST_ADMIN_OFFICER to userrole enum.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-04-12

"""

from collections.abc import Sequence

from alembic_postgresql_enum import TableReference

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.sync_enum_values(
        enum_schema="public",
        enum_name="userrole",
        new_values=["SUPER_ADMIN", "SUPERVISOR", "INSPECTOR", "DEPOT_KEEPER"],
        affected_columns=[
            TableReference(table_schema="public", table_name="users", column_name="role"),
        ],
        enum_values_to_rename=[],
    )
