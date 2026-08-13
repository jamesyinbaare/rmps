"""Add document ID extraction error fields and list indexes.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-08-12 21:45:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | Sequence[str] | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("id_extraction_error", sa.Text(), nullable=True))
    op.add_column(
        "documents",
        sa.Column("id_extraction_error_code", sa.String(length=32), nullable=True),
    )

    op.create_index(
        "ix_documents_exam_upload_uploaded_at",
        "documents",
        ["exam_id", "upload_status", "uploaded_at"],
        unique=False,
    )
    op.create_index(
        "ix_documents_exam_id_status_error_uploaded",
        "documents",
        ["exam_id", "id_extraction_status", "id_extraction_error_code", "uploaded_at"],
        unique=False,
    )
    op.create_index(
        "ix_documents_sheet_duplicate_lookup",
        "documents",
        ["exam_id", "school_id", "subject_id", "subject_series", "test_type", "sheet_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_documents_sheet_duplicate_lookup", table_name="documents")
    op.drop_index("ix_documents_exam_id_status_error_uploaded", table_name="documents")
    op.drop_index("ix_documents_exam_upload_uploaded_at", table_name="documents")
    op.drop_column("documents", "id_extraction_error_code")
    op.drop_column("documents", "id_extraction_error")
