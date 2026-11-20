"""Add regular registration type and allows_free_tvet on exam_eligible_schools

Revision ID: g4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-03-20 00:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from alembic_postgresql_enum import TableReference


revision: str = "g4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "exam_eligible_schools",
        sa.Column(
            "allows_free_tvet",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Expand registrationtype enum to include 'regular' without rewriting free_tvet rows
    op.sync_enum_values(
        enum_schema="public",
        enum_name="registrationtype",
        new_values=["regular", "free_tvet", "private", "referral"],
        affected_columns=[
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
        ],
        enum_values_to_rename=[],
    )


def downgrade() -> None:
    connection = op.get_bind()
    # Move any regular rows to free_tvet before removing enum value
    for table in (
        "registration_candidates",
        "subject_pricing",
        "registration_tiered_pricing",
        "registration_application_fees",
        "exam_pricing_models",
        "programme_pricing",
    ):
        connection.execute(
            sa.text(
                f"""
                ALTER TABLE {table}
                ALTER COLUMN registration_type TYPE text USING registration_type::text
                """
            )
        )
        connection.execute(
            sa.text(
                f"""
                UPDATE {table}
                SET registration_type = 'free_tvet'
                WHERE registration_type = 'regular'
                """
            )
        )

    op.sync_enum_values(
        enum_schema="public",
        enum_name="registrationtype",
        new_values=["free_tvet", "private", "referral"],
        affected_columns=[
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
        ],
        enum_values_to_rename=[],
    )

    op.drop_column("exam_eligible_schools", "allows_free_tvet")
