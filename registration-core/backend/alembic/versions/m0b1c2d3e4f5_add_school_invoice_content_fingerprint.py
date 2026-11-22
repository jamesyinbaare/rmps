"""Add content_fingerprint to school registration invoices

Revision ID: m0b1c2d3e4f5
Revises: l9a0b1c2d3e4
Create Date: 2026-11-22 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m0b1c2d3e4f5"
down_revision: Union[str, Sequence[str], None] = "l9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "school_registration_invoices",
        sa.Column("content_fingerprint", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_school_registration_invoices_content_fingerprint",
        "school_registration_invoices",
        ["content_fingerprint"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_school_registration_invoices_content_fingerprint",
        table_name="school_registration_invoices",
    )
    op.drop_column("school_registration_invoices", "content_fingerprint")
