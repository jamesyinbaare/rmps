"""Rename registration type regular to fee_paying

Revision ID: k8f9a0b1c2d3
Revises: j7e8f9a0b1c2
Create Date: 2026-11-22 10:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from alembic_postgresql_enum import TableReference


revision: str = "k8f9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "j7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_AFFECTED_COLUMNS = [
    TableReference(
        table_schema="public",
        table_name="registration_candidates",
        column_name="registration_type",
    ),
    TableReference(
        table_schema="public",
        table_name="subject_pricing",
        column_name="registration_type",
    ),
    TableReference(
        table_schema="public",
        table_name="registration_tiered_pricing",
        column_name="registration_type",
    ),
    TableReference(
        table_schema="public",
        table_name="registration_application_fees",
        column_name="registration_type",
    ),
    TableReference(
        table_schema="public",
        table_name="exam_pricing_models",
        column_name="registration_type",
    ),
    TableReference(
        table_schema="public",
        table_name="programme_pricing",
        column_name="registration_type",
    ),
]

_TABLES = (
    "registration_candidates",
    "subject_pricing",
    "registration_tiered_pricing",
    "registration_application_fees",
    "exam_pricing_models",
    "programme_pricing",
)


def upgrade() -> None:
    op.sync_enum_values(
        enum_schema="public",
        enum_name="registrationtype",
        new_values=["regular", "fee_paying", "free_tvet", "private", "referral"],
        affected_columns=_AFFECTED_COLUMNS,
        enum_values_to_rename=[],
    )

    connection = op.get_bind()
    for table in _TABLES:
        connection.execute(
            sa.text(
                f"""
                UPDATE {table}
                SET registration_type = 'fee_paying'
                WHERE registration_type = 'regular'
                """
            )
        )

    op.sync_enum_values(
        enum_schema="public",
        enum_name="registrationtype",
        new_values=["fee_paying", "free_tvet", "private", "referral"],
        affected_columns=_AFFECTED_COLUMNS,
        enum_values_to_rename=[],
    )


def downgrade() -> None:
    op.sync_enum_values(
        enum_schema="public",
        enum_name="registrationtype",
        new_values=["fee_paying", "regular", "free_tvet", "private", "referral"],
        affected_columns=_AFFECTED_COLUMNS,
        enum_values_to_rename=[],
    )

    connection = op.get_bind()
    for table in _TABLES:
        connection.execute(
            sa.text(
                f"""
                UPDATE {table}
                SET registration_type = 'regular'
                WHERE registration_type = 'fee_paying'
                """
            )
        )

    op.sync_enum_values(
        enum_schema="public",
        enum_name="registrationtype",
        new_values=["regular", "free_tvet", "private", "referral"],
        affected_columns=_AFFECTED_COLUMNS,
        enum_values_to_rename=[],
    )
