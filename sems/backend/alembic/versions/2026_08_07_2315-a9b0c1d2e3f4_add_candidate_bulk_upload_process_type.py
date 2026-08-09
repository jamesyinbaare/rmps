"""Add CANDIDATE_BULK_UPLOAD to processtype enum.

Revision ID: a9b0c1d2e3f4
Revises: f4a5b6c7d8e9
Create Date: 2026-08-07 23:15:00.000000

"""
from collections.abc import Sequence

from alembic import op
from alembic_postgresql_enum import TableReference

revision: str = "a9b0c1d2e3f4"
down_revision: str | Sequence[str] | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.sync_enum_values(
        enum_schema="public",
        enum_name="processtype",
        new_values=[
            "SERIALIZATION",
            "EXCEL_EXPORT_CORE",
            "EXCEL_EXPORT_ELECTIVES",
            "SCORE_SHEET_GENERATION",
            "PDF_GENERATION",
            "CANDIDATE_BULK_UPLOAD",
        ],
        affected_columns=[
            TableReference(
                table_schema="public",
                table_name="process_tracking",
                column_name="process_type",
            )
        ],
        enum_values_to_rename=[],
    )


def downgrade() -> None:
    op.sync_enum_values(
        enum_schema="public",
        enum_name="processtype",
        new_values=[
            "SERIALIZATION",
            "EXCEL_EXPORT_CORE",
            "EXCEL_EXPORT_ELECTIVES",
            "SCORE_SHEET_GENERATION",
            "PDF_GENERATION",
        ],
        affected_columns=[
            TableReference(
                table_schema="public",
                table_name="process_tracking",
                column_name="process_type",
            )
        ],
        enum_values_to_rename=[],
    )
