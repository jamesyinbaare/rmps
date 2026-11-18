"""Add certificate request models

Revision ID: db6f7283d80c
Revises: 253c3e679d56
Create Date: 2026-01-05 08:49:00.504507

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'db6f7283d80c'
down_revision: Union[str, Sequence[str], None] = '253c3e679d56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop enum types if they exist (from previous failed migrations) before creating them
    # Use DO block to check existence and drop safely
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificaterequesttype') THEN
                DROP TYPE certificaterequesttype CASCADE;
            END IF;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deliverymethod') THEN
                DROP TYPE deliverymethod CASCADE;
            END IF;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requeststatus') THEN
                DROP TYPE requeststatus CASCADE;
            END IF;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paymentstatus') THEN
                DROP TYPE paymentstatus CASCADE;
            END IF;
        END $$;
    """)

    # Create enum types
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificaterequesttype') THEN
                CREATE TYPE certificaterequesttype AS ENUM ('CERTIFICATE', 'ATTESTATION');
            END IF;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deliverymethod') THEN
                CREATE TYPE deliverymethod AS ENUM ('PICKUP', 'COURIER');
            END IF;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requeststatus') THEN
                CREATE TYPE requeststatus AS ENUM ('PENDING_PAYMENT', 'PAID', 'IN_PROCESS', 'READY_FOR_DISPATCH', 'DISPATCHED', 'RECEIVED', 'COMPLETED', 'CANCELLED');
            END IF;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paymentstatus') THEN
                CREATE TYPE paymentstatus AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');
            END IF;
        END $$;
    """)

    # Create certificate_requests table WITHOUT foreign keys to invoices and payments
    # Create table with VARCHAR columns first, then alter to use enum types
    # This prevents SQLAlchemy from trying to create enum types automatically
    op.create_table('certificate_requests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('request_type', sa.String(50), nullable=False),
    sa.Column('request_number', sa.String(length=50), nullable=False),
    sa.Column('index_number', sa.String(length=50), nullable=False),
    sa.Column('exam_year', sa.Integer(), nullable=False),
    sa.Column('examination_center_id', sa.Integer(), nullable=False),
    sa.Column('national_id_number', sa.String(length=50), nullable=False),
    sa.Column('national_id_file_path', sa.String(length=512), nullable=False),
    sa.Column('photograph_file_path', sa.String(length=512), nullable=False),
    sa.Column('delivery_method', sa.String(50), nullable=False),
    sa.Column('contact_phone', sa.String(length=50), nullable=False),
    sa.Column('contact_email', sa.String(length=255), nullable=True),
    sa.Column('courier_address_line1', sa.String(length=255), nullable=True),
    sa.Column('courier_address_line2', sa.String(length=255), nullable=True),
    sa.Column('courier_city', sa.String(length=100), nullable=True),
    sa.Column('courier_region', sa.String(length=100), nullable=True),
    sa.Column('courier_postal_code', sa.String(length=20), nullable=True),
    sa.Column('status', sa.String(50), nullable=False),
    # invoice_id removed - Invoice.certificate_request_id is the owning side of the one-to-one relationship
    sa.Column('payment_id', sa.Integer(), nullable=True),
    sa.Column('processed_by_user_id', sa.UUID(), nullable=True),
    sa.Column('dispatched_by_user_id', sa.UUID(), nullable=True),
    sa.Column('dispatched_at', sa.DateTime(), nullable=True),
    sa.Column('tracking_number', sa.String(length=100), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['dispatched_by_user_id'], ['portal_users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['examination_center_id'], ['schools.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['processed_by_user_id'], ['portal_users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_certificate_requests_created_at'), 'certificate_requests', ['created_at'], unique=False)
    op.create_index(op.f('ix_certificate_requests_dispatched_by_user_id'), 'certificate_requests', ['dispatched_by_user_id'], unique=False)
    op.create_index(op.f('ix_certificate_requests_exam_year'), 'certificate_requests', ['exam_year'], unique=False)
    op.create_index(op.f('ix_certificate_requests_examination_center_id'), 'certificate_requests', ['examination_center_id'], unique=False)
    op.create_index(op.f('ix_certificate_requests_index_number'), 'certificate_requests', ['index_number'], unique=False)
    # ix_certificate_requests_invoice_id index removed - invoice_id column removed
    op.create_index(op.f('ix_certificate_requests_national_id_number'), 'certificate_requests', ['national_id_number'], unique=False)
    op.create_index(op.f('ix_certificate_requests_payment_id'), 'certificate_requests', ['payment_id'], unique=False)
    op.create_index(op.f('ix_certificate_requests_processed_by_user_id'), 'certificate_requests', ['processed_by_user_id'], unique=False)
    op.create_index(op.f('ix_certificate_requests_request_number'), 'certificate_requests', ['request_number'], unique=True)
    op.create_index(op.f('ix_certificate_requests_request_type'), 'certificate_requests', ['request_type'], unique=False)
    op.create_index(op.f('ix_certificate_requests_status'), 'certificate_requests', ['status'], unique=False)
    op.create_table('invoices',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('invoice_number', sa.String(length=50), nullable=False),
    sa.Column('certificate_request_id', sa.Integer(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['certificate_request_id'], ['certificate_requests.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_invoices_certificate_request_id'), 'invoices', ['certificate_request_id'], unique=True)
    op.create_index(op.f('ix_invoices_invoice_number'), 'invoices', ['invoice_number'], unique=True)
    op.create_index(op.f('ix_invoices_status'), 'invoices', ['status'], unique=False)
    op.create_table('payments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('invoice_id', sa.Integer(), nullable=True),
    sa.Column('certificate_request_id', sa.Integer(), nullable=False),
    sa.Column('paystack_reference', sa.String(length=100), nullable=True),
    sa.Column('paystack_authorization_url', sa.String(length=512), nullable=True),
    sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('status', sa.String(50), nullable=False),
    sa.Column('paystack_response', postgresql.JSON(astext_type=sa.Text()), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['certificate_request_id'], ['certificate_requests.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_payments_certificate_request_id'), 'payments', ['certificate_request_id'], unique=False)
    op.create_index(op.f('ix_payments_created_at'), 'payments', ['created_at'], unique=False)
    op.create_index(op.f('ix_payments_invoice_id'), 'payments', ['invoice_id'], unique=False)
    op.create_index(op.f('ix_payments_paystack_reference'), 'payments', ['paystack_reference'], unique=True)
    op.create_index(op.f('ix_payments_status'), 'payments', ['status'], unique=False)

    # Alter payments.status column to use enum type
    op.execute("ALTER TABLE payments ALTER COLUMN status TYPE paymentstatus USING status::paymentstatus")

    # Now add the foreign key constraint to certificate_requests for payment_id
    # Note: invoice_id foreign key removed - Invoice.certificate_request_id is the owning side
    op.create_foreign_key(
        'fk_certificate_requests_payment_id',
        'certificate_requests', 'payments',
        ['payment_id'], ['id'],
        ondelete='SET NULL'
    )

    op.create_index(op.f('ix_index_number_generation_jobs_status'), 'index_number_generation_jobs', ['status'], unique=False)
    # op.create_unique_constraint('uq_programme_subject', 'programme_subjects', ['programme_id', 'subject_id'])
    # op.create_unique_constraint('uq_school_programme', 'school_programmes', ['school_id', 'programme_id'])
    # # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # Drop foreign key constraints from certificate_requests first
    op.drop_constraint('fk_certificate_requests_payment_id', 'certificate_requests', type_='foreignkey')
    # fk_certificate_requests_invoice_id removed - invoice_id column removed

    op.drop_index(op.f('ix_index_number_generation_jobs_status'), table_name='index_number_generation_jobs')
    op.drop_index(op.f('ix_payments_status'), table_name='payments')
    op.drop_index(op.f('ix_payments_paystack_reference'), table_name='payments')
    op.drop_index(op.f('ix_payments_invoice_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_created_at'), table_name='payments')
    op.drop_index(op.f('ix_payments_certificate_request_id'), table_name='payments')
    op.drop_table('payments')
    op.drop_index(op.f('ix_invoices_status'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_invoice_number'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_certificate_request_id'), table_name='invoices')
    op.drop_table('invoices')
    op.drop_index(op.f('ix_certificate_requests_status'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_request_type'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_request_number'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_processed_by_user_id'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_payment_id'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_national_id_number'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_index_number'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_examination_center_id'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_exam_year'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_dispatched_by_user_id'), table_name='certificate_requests')
    op.drop_index(op.f('ix_certificate_requests_created_at'), table_name='certificate_requests')
    op.drop_table('certificate_requests')

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS paymentstatus CASCADE")
    op.execute("DROP TYPE IF EXISTS requeststatus CASCADE")
    op.execute("DROP TYPE IF EXISTS deliverymethod CASCADE")
    op.execute("DROP TYPE IF EXISTS certificaterequesttype CASCADE")
