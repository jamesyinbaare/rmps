"""Make certificate_number nullable (manual / OCR assignment).

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-08-10 22:40:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, None] = "b5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres UNIQUE allows multiple NULLs; keep unique constraint as-is.
    op.alter_column(
        "certificate_issuances",
        "certificate_number",
        existing_type=sa.String(length=64),
        nullable=True,
    )


def downgrade() -> None:
    # Fill nulls so NOT NULL can be restored
    op.execute(
        "UPDATE certificate_issuances "
        "SET certificate_number = 'TEMP-' || id::text "
        "WHERE certificate_number IS NULL"
    )
    op.alter_column(
        "certificate_issuances",
        "certificate_number",
        existing_type=sa.String(length=64),
        nullable=False,
    )
