"""Add examination_series to certificate_requests

Revision ID: 14d00b14a8f4
Revises: e6cf316340ea
Create Date: 2026-01-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '14d00b14a8f4'
down_revision: Union[str, Sequence[str], None] = 'e6cf316340ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create ExamSeries enum type if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'examseries') THEN
                CREATE TYPE examseries AS ENUM ('MAY/JUNE', 'NOV/DEC');
            END IF;
        END $$;
    """)

    # Add examination_series column as nullable initially
    op.add_column('certificate_requests', sa.Column('examination_series', sa.Enum('MAY/JUNE', 'NOV/DEC', name='examseries', create_type=False), nullable=True))

    # Update all existing records to set examination_series = 'NOV/DEC'
    op.execute("UPDATE certificate_requests SET examination_series = 'NOV/DEC' WHERE examination_series IS NULL")

    # Make column non-nullable (no database default)
    op.alter_column('certificate_requests', 'examination_series',
                    existing_type=sa.Enum('MAY/JUNE', 'NOV/DEC', name='examseries', create_type=False),
                    nullable=False)

    # Create index on examination_series
    op.create_index(op.f('ix_certificate_requests_examination_series'), 'certificate_requests', ['examination_series'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Drop index
    op.drop_index(op.f('ix_certificate_requests_examination_series'), table_name='certificate_requests')

    # Drop column
    op.drop_column('certificate_requests', 'examination_series')

    # Note: We don't drop the examseries enum type as it might be used elsewhere
    # If needed, it can be dropped manually: DROP TYPE IF EXISTS examseries CASCADE;
