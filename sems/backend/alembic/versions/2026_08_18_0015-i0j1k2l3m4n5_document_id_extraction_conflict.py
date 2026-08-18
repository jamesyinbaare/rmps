"""Add document ID extraction conflict document id and backfill duplicates.

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-08-18 00:15:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "i0j1k2l3m4n5"
down_revision: str | Sequence[str] | None = "h9i0j1k2l3m4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("id_extraction_conflict_document_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_documents_id_extraction_conflict_document_id",
        "documents",
        ["id_extraction_conflict_document_id"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            UPDATE documents AS d
            SET id_extraction_conflict_document_id = CAST(
                substring(d.id_extraction_error FROM 'document #([0-9]+)') AS INTEGER
            )
            WHERE d.id_extraction_error_code = 'duplicate'
              AND d.id_extraction_conflict_document_id IS NULL
              AND d.id_extraction_error ~ 'document #[0-9]+'
              AND EXISTS (
                SELECT 1
                FROM documents AS other
                WHERE other.id = CAST(
                    substring(d.id_extraction_error FROM 'document #([0-9]+)') AS INTEGER
                )
              )
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_documents_id_extraction_conflict_document_id", table_name="documents")
    op.drop_column("documents", "id_extraction_conflict_document_id")
