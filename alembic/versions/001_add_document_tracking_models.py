"""Add document tracking models

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create schools table
    op.create_table(
        'schools',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=6), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_schools_code'), 'schools', ['code'], unique=True)

    # Create subjects table
    op.create_table(
        'subjects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=4), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_subjects_code'), 'subjects', ['code'], unique=True)

    # Create school_subjects association table
    op.create_table(
        'school_subjects',
        sa.Column('school_id', sa.Integer(), nullable=False),
        sa.Column('subject_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('school_id', 'subject_id'),
        sa.UniqueConstraint('school_id', 'subject_id', name='uq_school_subject')
    )

    # Create documents table
    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=512), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('checksum', sa.String(length=64), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False),
        sa.Column('school_id', sa.Integer(), nullable=True),
        sa.Column('subject_id', sa.Integer(), nullable=True),
        sa.Column('test_type', sa.String(length=1), nullable=True),
        sa.Column('sheet_number', sa.String(length=2), nullable=True),
        sa.Column('extracted_id', sa.String(length=13), nullable=True),
        sa.Column('extraction_method', sa.String(length=20), nullable=True),
        sa.Column('extraction_confidence', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_checksum'), 'documents', ['checksum'], unique=False)
    op.create_index(op.f('ix_documents_extracted_id'), 'documents', ['extracted_id'], unique=False)
    op.create_index(op.f('ix_documents_school_id'), 'documents', ['school_id'], unique=False)
    op.create_index(op.f('ix_documents_subject_id'), 'documents', ['subject_id'], unique=False)

    # Create batches table
    op.create_table(
        'batches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('total_files', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('processed_files', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_files', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_batches_status'), 'batches', ['status'], unique=False)

    # Create batch_documents table
    op.create_table(
        'batch_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('batch_id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('processing_status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_batch_documents_batch_id'), 'batch_documents', ['batch_id'], unique=False)
    op.create_index(op.f('ix_batch_documents_document_id'), 'batch_documents', ['document_id'], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index(op.f('ix_batch_documents_document_id'), table_name='batch_documents')
    op.drop_index(op.f('ix_batch_documents_batch_id'), table_name='batch_documents')
    op.drop_table('batch_documents')
    op.drop_index(op.f('ix_batches_status'), table_name='batches')
    op.drop_table('batches')
    op.drop_index(op.f('ix_documents_subject_id'), table_name='documents')
    op.drop_index(op.f('ix_documents_school_id'), table_name='documents')
    op.drop_index(op.f('ix_documents_extracted_id'), table_name='documents')
    op.drop_index(op.f('ix_documents_checksum'), table_name='documents')
    op.drop_table('documents')
    op.drop_table('school_subjects')
    op.drop_index(op.f('ix_subjects_code'), table_name='subjects')
    op.drop_table('subjects')
    op.drop_index(op.f('ix_schools_code'), table_name='schools')
    op.drop_table('schools')
