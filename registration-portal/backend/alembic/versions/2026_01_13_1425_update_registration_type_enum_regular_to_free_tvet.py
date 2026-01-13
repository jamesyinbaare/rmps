"""Update registration_type enum: regular to free_tvet

Revision ID: update_reg_type_enum
Revises: f06106ce6729
Create Date: 2026-01-13 14:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from alembic_postgresql_enum import TableReference
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'update_reg_type_enum'
down_revision: Union[str, Sequence[str], None] = 'f06106ce6729'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Update registrationtype enum: replace 'regular' with 'free_tvet'."""
    # Cast column to text first to allow updating to new enum value
    connection = op.get_bind()
    connection.execute(sa.text("""
        ALTER TABLE registration_candidates
        ALTER COLUMN registration_type TYPE text USING registration_type::text
    """))

    # Update data values from 'regular' to 'free_tvet' (now that column is text)
    connection.execute(sa.text("""
        UPDATE registration_candidates
        SET registration_type = 'free_tvet'
        WHERE registration_type = 'regular'
    """))

    # Now use sync_enum_values to update the enum type and convert column back
    # This will recreate the enum with the new values and convert the column
    op.sync_enum_values(
        enum_schema='public',
        enum_name='registrationtype',
        new_values=['free_tvet', 'private', 'referral'],
        affected_columns=[
            TableReference(table_schema='public', table_name='registration_candidates', column_name='registration_type')
        ],
        enum_values_to_rename=[],
    )


def downgrade() -> None:
    """Revert registrationtype enum: replace 'free_tvet' with 'regular'."""
    # Cast column to text first
    connection = op.get_bind()
    connection.execute(sa.text("""
        ALTER TABLE registration_candidates
        ALTER COLUMN registration_type TYPE text USING registration_type::text
    """))

    # Update data values from 'free_tvet' to 'regular'
    connection.execute(sa.text("""
        UPDATE registration_candidates
        SET registration_type = 'regular'
        WHERE registration_type = 'free_tvet'
    """))

    # Use sync_enum_values to revert the enum type and convert column back
    op.sync_enum_values(
        enum_schema='public',
        enum_name='registrationtype',
        new_values=['regular', 'private', 'referral'],
        affected_columns=[
            TableReference(table_schema='public', table_name='registration_candidates', column_name='registration_type')
        ],
        enum_values_to_rename=[],
    )
