"""add response revocation fields

Revision ID: f7g8h9i0j1k2
Revises: a1b2c3d4e5f6
Create Date: 2026-01-07 21:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f7g8h9i0j1k2'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add response revocation fields to certificate_confirmation_requests table
    # Use IF NOT EXISTS checks to make migration idempotent
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='certificate_confirmation_requests'
                AND column_name='response_revoked'
            ) THEN
                ALTER TABLE certificate_confirmation_requests
                ADD COLUMN response_revoked BOOLEAN NOT NULL DEFAULT false;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='certificate_confirmation_requests'
                AND column_name='response_revoked_at'
            ) THEN
                ALTER TABLE certificate_confirmation_requests
                ADD COLUMN response_revoked_at TIMESTAMP;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='certificate_confirmation_requests'
                AND column_name='response_revoked_by_user_id'
            ) THEN
                ALTER TABLE certificate_confirmation_requests
                ADD COLUMN response_revoked_by_user_id UUID;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='certificate_confirmation_requests'
                AND column_name='response_revocation_reason'
            ) THEN
                ALTER TABLE certificate_confirmation_requests
                ADD COLUMN response_revocation_reason TEXT;
            END IF;
        END $$;
    """)
    # Create indexes if they don't exist
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_certificate_confirmation_requests_response_revoked
        ON certificate_confirmation_requests(response_revoked);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_certificate_confirmation_requests_response_revoked_by_user_id
        ON certificate_confirmation_requests(response_revoked_by_user_id);
    """)
    # Add foreign key constraint if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name LIKE '%response_revoked_by_user_id%'
                AND table_name='certificate_confirmation_requests'
            ) THEN
                ALTER TABLE certificate_confirmation_requests
                ADD CONSTRAINT fk_certificate_confirmation_requests_response_revoked_by_user_id
                FOREIGN KEY (response_revoked_by_user_id)
                REFERENCES portal_users(id)
                ON DELETE SET NULL;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_constraint(None, 'certificate_confirmation_requests', type_='foreignkey')
    op.drop_index(op.f('ix_certificate_confirmation_requests_response_revoked_by_user_id'), table_name='certificate_confirmation_requests')
    op.drop_index(op.f('ix_certificate_confirmation_requests_response_revoked'), table_name='certificate_confirmation_requests')
    op.drop_column('certificate_confirmation_requests', 'response_revocation_reason')
    op.drop_column('certificate_confirmation_requests', 'response_revoked_by_user_id')
    op.drop_column('certificate_confirmation_requests', 'response_revoked_at')
    op.drop_column('certificate_confirmation_requests', 'response_revoked')
