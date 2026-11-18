"""add_draft_to_registration_status

Revision ID: add_draft_status
Revises: add_private_exam_center
Create Date: 2026-01-03 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_draft_status'
down_revision: Union[str, Sequence[str], None] = 'add_private_exam_center'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add DRAFT to registrationstatus enum."""
    # Add DRAFT value to the registrationstatus enum
    # Use DO block to check if value exists first (IF NOT EXISTS not available in all PostgreSQL versions)
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'DRAFT'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'registrationstatus')
            ) THEN
                ALTER TYPE registrationstatus ADD VALUE 'DRAFT';
            END IF;
        END $$;
    """)


def downgrade() -> None:
    """Remove DRAFT from registrationstatus enum."""
    # Note: PostgreSQL doesn't support removing enum values directly
    # This would require recreating the enum, which is complex
    # For now, we'll leave a comment that manual intervention is needed
    # In production, you would need to:
    # 1. Create a new enum without DRAFT
    # 2. Update all columns to use the new enum
    # 3. Drop the old enum
    # 4. Rename the new enum
    pass
