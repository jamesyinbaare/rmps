"""Add response signing fields to CertificateConfirmationRequest

Revision ID: a1b2c3d4e5f6
Revises: 9b0c1a2d3e4f
Create Date: 2026-01-07

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "9b0c1a2d3e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_signed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_signed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "certificate_confirmation_requests",
        sa.Column("response_signed_by_user_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        op.f("ix_certificate_confirmation_requests_response_signed_by_user_id"),
        "certificate_confirmation_requests",
        ["response_signed_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        None,
        "certificate_confirmation_requests",
        "portal_users",
        ["response_signed_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, "certificate_confirmation_requests", type_="foreignkey")
    op.drop_index(
        op.f("ix_certificate_confirmation_requests_response_signed_by_user_id"),
        table_name="certificate_confirmation_requests",
    )
    op.drop_column("certificate_confirmation_requests", "response_signed_by_user_id")
    op.drop_column("certificate_confirmation_requests", "response_signed_at")
    op.drop_column("certificate_confirmation_requests", "response_signed")
