"""Add certificate_templates and certificate_issuances tables.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-10 17:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e2f3a4b5c6d7"
down_revision: str | Sequence[str] | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EXAM_TYPE_VALUES = (
    "Certificate II Examinations",
    "Advance",
    "Technician Part I",
    "Technician Part II",
    "Technician Part III",
    "Diploma",
)

ISSUANCE_STATUS_VALUES = (
    "generated",
    "printed",
    "void",
    "matched_scan",
)


def upgrade() -> None:
    # Create enums once; columns must use create_type=False so create_table
    # does not attempt CREATE TYPE again.
    exam_type_enum = postgresql.ENUM(
        *EXAM_TYPE_VALUES,
        name="certificateexamtype",
        create_type=False,
    )
    issuance_status_enum = postgresql.ENUM(
        *ISSUANCE_STATUS_VALUES,
        name="certificateissuancestatus",
        create_type=False,
    )
    exam_type_enum.create(op.get_bind(), checkfirst=True)
    issuance_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "certificate_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("exam_type", exam_type_enum, nullable=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("page_width_mm", sa.Float(), nullable=False, server_default="210"),
        sa.Column("page_height_mm", sa.Float(), nullable=False, server_default="297"),
        sa.Column("layout_json", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_certificate_templates_exam_type", "certificate_templates", ["exam_type"])
    op.create_index("ix_certificate_templates_exam_id", "certificate_templates", ["exam_id"])
    op.create_index("ix_certificate_templates_is_active", "certificate_templates", ["is_active"])

    op.create_table(
        "certificate_issuances",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "exam_registration_id",
            sa.Integer(),
            sa.ForeignKey("exam_registrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("certificate_number", sa.String(length=64), nullable=False),
        sa.Column("status", issuance_status_enum, nullable=False),
        sa.Column("layout_snapshot_json", sa.JSON(), nullable=True),
        sa.Column("grades_snapshot_json", sa.JSON(), nullable=True),
        sa.Column("pdf_storage_path", sa.String(length=512), nullable=True),
        sa.Column(
            "supersedes_id",
            sa.Integer(),
            sa.ForeignKey("certificate_issuances.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column(
            "generated_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.Column(
            "printed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("printed_at", sa.DateTime(), nullable=True),
        sa.Column("scan_document_path", sa.String(length=512), nullable=True),
        sa.Column("ocr_certificate_number", sa.String(length=64), nullable=True),
        sa.Column(
            "matched_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("matched_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_certificate_issuances_exam_registration_id",
        "certificate_issuances",
        ["exam_registration_id"],
    )
    op.create_index(
        "ix_certificate_issuances_certificate_number",
        "certificate_issuances",
        ["certificate_number"],
        unique=True,
    )
    op.create_index("ix_certificate_issuances_status", "certificate_issuances", ["status"])
    op.create_index("ix_certificate_issuances_generated_at", "certificate_issuances", ["generated_at"])


def downgrade() -> None:
    op.drop_index("ix_certificate_issuances_generated_at", table_name="certificate_issuances")
    op.drop_index("ix_certificate_issuances_status", table_name="certificate_issuances")
    op.drop_index("ix_certificate_issuances_certificate_number", table_name="certificate_issuances")
    op.drop_index(
        "ix_certificate_issuances_exam_registration_id", table_name="certificate_issuances"
    )
    op.drop_table("certificate_issuances")

    op.drop_index("ix_certificate_templates_is_active", table_name="certificate_templates")
    op.drop_index("ix_certificate_templates_exam_id", table_name="certificate_templates")
    op.drop_index("ix_certificate_templates_exam_type", table_name="certificate_templates")
    op.drop_table("certificate_templates")

    postgresql.ENUM(name="certificateissuancestatus").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="certificateexamtype").drop(op.get_bind(), checkfirst=True)
