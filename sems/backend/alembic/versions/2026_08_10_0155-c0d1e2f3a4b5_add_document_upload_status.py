"""Add upload_status to documents for signed-URL pending uploads.

Revision ID: c0d1e2f3a4b5
Revises: b8c9d0e1f2a3
Create Date: 2026-08-10 01:55:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c0d1e2f3a4b5"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("upload_status", sa.String(length=20), nullable=False, server_default="uploaded"),
    )
    op.create_index("ix_documents_upload_status", "documents", ["upload_status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_documents_upload_status", table_name="documents")
    op.drop_column("documents", "upload_status")
