"""Add issuance_date and certificate template assets.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-10 17:55:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "certificate_issuances",
        sa.Column("issuance_date", sa.Date(), nullable=True),
    )
    op.create_index(
        "ix_certificate_issuances_issuance_date",
        "certificate_issuances",
        ["issuance_date"],
        unique=False,
    )

    op.create_table(
        "certificate_template_assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "template_id",
            sa.Integer(),
            sa.ForeignKey("certificate_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("template_id", "key", name="uq_certificate_template_asset_key"),
    )
    op.create_index(
        "ix_certificate_template_assets_template_id",
        "certificate_template_assets",
        ["template_id"],
    )
    op.create_index(
        "ix_certificate_template_assets_key",
        "certificate_template_assets",
        ["key"],
    )


def downgrade() -> None:
    op.drop_index("ix_certificate_template_assets_key", table_name="certificate_template_assets")
    op.drop_index(
        "ix_certificate_template_assets_template_id", table_name="certificate_template_assets"
    )
    op.drop_table("certificate_template_assets")

    op.drop_index("ix_certificate_issuances_issuance_date", table_name="certificate_issuances")
    op.drop_column("certificate_issuances", "issuance_date")
