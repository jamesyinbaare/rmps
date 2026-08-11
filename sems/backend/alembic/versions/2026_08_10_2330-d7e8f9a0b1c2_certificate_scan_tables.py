"""Add certificate scan batch / scan tables for Certificate Studio.

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-08-10 23:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BATCH_STATUS_VALUES = ("open", "processing", "completed")
MATCH_STATUS_VALUES = ("pending", "matched", "unmatched", "rejected")


def upgrade() -> None:
    batch_status = postgresql.ENUM(
        *BATCH_STATUS_VALUES,
        name="certificatescanbatchstatus",
        create_type=False,
    )
    match_status = postgresql.ENUM(
        *MATCH_STATUS_VALUES,
        name="certificatescanmatchstatus",
        create_type=False,
    )
    batch_status.create(op.get_bind(), checkfirst=True)
    match_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "certificate_scan_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("roi_certificate_number", sa.JSON(), nullable=False),
        sa.Column("roi_index_number", sa.JSON(), nullable=False),
        sa.Column("status", batch_status, nullable=False, server_default="open"),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_certificate_scan_batches_exam_id", "certificate_scan_batches", ["exam_id"])
    op.create_index("ix_certificate_scan_batches_status", "certificate_scan_batches", ["status"])
    op.create_index("ix_certificate_scan_batches_created_at", "certificate_scan_batches", ["created_at"])

    op.create_table(
        "certificate_scans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "batch_id",
            sa.Integer(),
            sa.ForeignKey("certificate_scan_batches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_path", sa.String(length=512), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("ocr_index_number", sa.String(length=64), nullable=True),
        sa.Column("ocr_certificate_number", sa.String(length=64), nullable=True),
        sa.Column("match_status", match_status, nullable=False, server_default="pending"),
        sa.Column(
            "issuance_id",
            sa.Integer(),
            sa.ForeignKey("certificate_issuances.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "suggested_exam_registration_id",
            sa.Integer(),
            sa.ForeignKey("exam_registrations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_certificate_scans_batch_id", "certificate_scans", ["batch_id"])
    op.create_index("ix_certificate_scans_match_status", "certificate_scans", ["match_status"])
    op.create_index("ix_certificate_scans_issuance_id", "certificate_scans", ["issuance_id"])


def downgrade() -> None:
    op.drop_index("ix_certificate_scans_issuance_id", table_name="certificate_scans")
    op.drop_index("ix_certificate_scans_match_status", table_name="certificate_scans")
    op.drop_index("ix_certificate_scans_batch_id", table_name="certificate_scans")
    op.drop_table("certificate_scans")
    op.drop_index("ix_certificate_scan_batches_created_at", table_name="certificate_scan_batches")
    op.drop_index("ix_certificate_scan_batches_status", table_name="certificate_scan_batches")
    op.drop_index("ix_certificate_scan_batches_exam_id", table_name="certificate_scan_batches")
    op.drop_table("certificate_scan_batches")
    postgresql.ENUM(name="certificatescanmatchstatus").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="certificatescanbatchstatus").drop(op.get_bind(), checkfirst=True)
