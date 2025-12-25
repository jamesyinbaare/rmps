"""Update document model

Revision ID: 53efa0babea8
Revises: 51a6caf5f269
Create Date: 2025-12-24 23:37:45.706972

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '53efa0babea8'
down_revision: Union[str, Sequence[str], None] = '51a6caf5f269'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Ensure the enum type exists (should already exist from previous migration)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE dataextractionmethod AS ENUM ('AUTOMATED_EXTRACTION', 'MANUAL_TRANSCRIPTION_DIGITAL', 'MANUAL_ENTRY_PHYSICAL');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # Alter column with explicit USING clause to cast VARCHAR to Enum
    op.execute("""
        ALTER TABLE documents
        ALTER COLUMN scores_extraction_method
        TYPE dataextractionmethod
        USING CASE
            WHEN scores_extraction_method IS NULL THEN NULL
            WHEN scores_extraction_method IN ('AUTOMATED_EXTRACTION', 'MANUAL_TRANSCRIPTION_DIGITAL', 'MANUAL_ENTRY_PHYSICAL')
            THEN scores_extraction_method::dataextractionmethod
            ELSE NULL
        END
    """)


def downgrade() -> None:
    """Downgrade schema."""
    # Convert Enum back to VARCHAR with explicit USING clause
    op.execute("""
        ALTER TABLE documents
        ALTER COLUMN scores_extraction_method
        TYPE VARCHAR(40)
        USING CASE
            WHEN scores_extraction_method IS NULL THEN NULL
            ELSE scores_extraction_method::text
        END
    """)
