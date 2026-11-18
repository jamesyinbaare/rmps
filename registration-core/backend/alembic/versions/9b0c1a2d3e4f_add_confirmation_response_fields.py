"""Add response fields to CertificateConfirmationRequest

Revision ID: 9b0c1a2d3e4f
Revises: 36b92ca6da04
Create Date: 2026-01-07

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "9b0c1a2d3e4f"
down_revision: Union[str, Sequence[str], None] = "36b92ca6da04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_file_path", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_file_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_mime_type", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_source", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("responded_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("responded_by_user_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_payload", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )

    op.create_index(
        op.f("ix_certificate_confirmation_requests_responded_by_user_id"),
        "certificate_confirmation_requests",
        ["responded_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        None,
        "certificate_confirmation_requests",
        "portal_users",
        ["responded_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, "certificate_confirmation_requests", type_="foreignkey")
    op.drop_index(
        op.f("ix_certificate_confirmation_requests_responded_by_user_id"),
        table_name="certificate_confirmation_requests",
    )
    op.drop_column("certificate_confirmation_requests", "response_payload")
    op.drop_column("certificate_confirmation_requests", "response_notes")
    op.drop_column("certificate_confirmation_requests", "responded_by_user_id")
    op.drop_column("certificate_confirmation_requests", "responded_at")
    op.drop_column("certificate_confirmation_requests", "response_source")
    op.drop_column("certificate_confirmation_requests", "response_mime_type")
    op.drop_column("certificate_confirmation_requests", "response_file_name")
    op.drop_column("certificate_confirmation_requests", "response_file_path")
