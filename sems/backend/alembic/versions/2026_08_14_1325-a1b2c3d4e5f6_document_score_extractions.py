"""Add per-provider document score extractions.

Revision ID: f7a8b9c0d1e2
Revises: e8f9a0b1c2d3
Create Date: 2026-08-14 13:25:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_score_extractions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("extracted_at", sa.DateTime(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("applied_count", sa.Integer(), nullable=True),
        sa.Column("unmatched_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_document_score_extractions_document_id",
        "document_score_extractions",
        ["document_id"],
        unique=False,
    )
    op.create_index(
        "ix_document_score_extractions_provider",
        "document_score_extractions",
        ["provider"],
        unique=False,
    )
    op.create_index(
        "ix_document_score_extractions_status",
        "document_score_extractions",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_document_score_extractions_provider_status",
        "document_score_extractions",
        ["provider", "status"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_document_score_extraction_provider",
        "document_score_extractions",
        ["document_id", "provider"],
    )

    op.add_column(
        "unmatched_extraction_records",
        sa.Column("extraction_provider", sa.String(length=20), nullable=True),
    )
    op.create_index(
        "ix_unmatched_extraction_records_extraction_provider",
        "unmatched_extraction_records",
        ["extraction_provider"],
        unique=False,
    )

    op.execute(
        """
        INSERT INTO document_score_extractions (
            document_id, provider, data, status, confidence, error_message,
            extracted_at, applied_at, applied_count, unmatched_count, created_at, updated_at
        )
        SELECT
            id,
            COALESCE(NULLIF(scores_extraction_data->>'provider', ''), 'reducto'),
            scores_extraction_data,
            COALESCE(scores_extraction_status, 'pending'),
            scores_extraction_confidence,
            NULL,
            scores_extracted_at,
            scores_applied_at,
            scores_applied_count,
            scores_unmatched_count,
            NOW(),
            NOW()
        FROM documents
        WHERE scores_extraction_data IS NOT NULL
           OR COALESCE(scores_extraction_status, 'pending') <> 'pending'
           OR scores_extracted_at IS NOT NULL
           OR scores_applied_at IS NOT NULL
        ON CONFLICT (document_id, provider) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_unmatched_extraction_records_extraction_provider",
        table_name="unmatched_extraction_records",
    )
    op.drop_column("unmatched_extraction_records", "extraction_provider")
    op.drop_index("ix_document_score_extractions_provider_status", table_name="document_score_extractions")
    op.drop_index("ix_document_score_extractions_status", table_name="document_score_extractions")
    op.drop_index("ix_document_score_extractions_provider", table_name="document_score_extractions")
    op.drop_index("ix_document_score_extractions_document_id", table_name="document_score_extractions")
    op.drop_table("document_score_extractions")
