"""Store clerk match on resolved unmatched records.

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-08-18 16:46:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "j1k2l3m4n5o6"
down_revision: str | Sequence[str] | None = "i0j1k2l3m4n5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "unmatched_extraction_records",
        sa.Column("resolved_subject_registration_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_unmatched_resolved_reg_id",
        "unmatched_extraction_records",
        ["resolved_subject_registration_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_unmatched_resolved_subject_registration_id",
        "unmatched_extraction_records",
        "subject_registrations",
        ["resolved_subject_registration_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_unmatched_resolved_subject_registration_id",
        "unmatched_extraction_records",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_unmatched_resolved_reg_id",
        table_name="unmatched_extraction_records",
    )
    op.drop_column("unmatched_extraction_records", "resolved_subject_registration_id")
