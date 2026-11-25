"""Add school registration completion confirmation

Revision ID: r5a6b7c8d9e0
Revises: q4f5a6b7c8d9
Create Date: 2026-11-24 23:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "r5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = "q4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registration_exams",
        sa.Column(
            "requires_completion_confirmation",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )

    op.create_table(
        "school_registration_completions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "confirmed",
                "withdrawn",
                name="schoolregistrationcompletionstatus",
                create_constraint=False,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("confirmation_token", sa.String(length=36), nullable=False),
        sa.Column("payload_nonce", sa.String(length=32), nullable=False),
        sa.Column("total_candidates", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("counts_by_type", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("counts_by_programme", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("counts_digest", sa.String(length=64), nullable=False),
        sa.Column("declaration_generated_at", sa.DateTime(), nullable=False),
        sa.Column("generation_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "confirmed_by_user_id",
            sa.UUID(),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("scanned_file_path", sa.String(length=512), nullable=True),
        sa.Column("scanned_mime_type", sa.String(length=100), nullable=True),
        sa.Column("scanned_checksum", sa.String(length=64), nullable=True),
        sa.Column("withdrawn_at", sa.DateTime(), nullable=True),
        sa.Column(
            "withdrawn_by_user_id",
            sa.UUID(),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("principal_email_sent_at", sa.DateTime(), nullable=True),
        sa.Column("principal_sms_sent_at", sa.DateTime(), nullable=True),
        sa.Column("notify_email_error", sa.Text(), nullable=True),
        sa.Column("notify_sms_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("exam_id", "school_id", name="uq_school_registration_completion_exam_school"),
        sa.UniqueConstraint("confirmation_token", name="uq_school_registration_completion_token"),
    )
    op.create_index(
        "ix_school_registration_completions_exam_id",
        "school_registration_completions",
        ["exam_id"],
    )
    op.create_index(
        "ix_school_registration_completions_school_id",
        "school_registration_completions",
        ["school_id"],
    )
    op.create_index(
        "ix_school_registration_completions_status",
        "school_registration_completions",
        ["status"],
    )
    op.create_index(
        "ix_school_registration_completions_confirmation_token",
        "school_registration_completions",
        ["confirmation_token"],
    )
    op.create_index(
        "ix_school_registration_completions_confirmed_by_user_id",
        "school_registration_completions",
        ["confirmed_by_user_id"],
    )
    op.create_index(
        "ix_school_registration_completions_withdrawn_by_user_id",
        "school_registration_completions",
        ["withdrawn_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_school_registration_completions_withdrawn_by_user_id",
        table_name="school_registration_completions",
    )
    op.drop_index(
        "ix_school_registration_completions_confirmed_by_user_id",
        table_name="school_registration_completions",
    )
    op.drop_index(
        "ix_school_registration_completions_confirmation_token",
        table_name="school_registration_completions",
    )
    op.drop_index(
        "ix_school_registration_completions_status",
        table_name="school_registration_completions",
    )
    op.drop_index(
        "ix_school_registration_completions_school_id",
        table_name="school_registration_completions",
    )
    op.drop_index(
        "ix_school_registration_completions_exam_id",
        table_name="school_registration_completions",
    )
    op.drop_table("school_registration_completions")
    op.execute("DROP TYPE IF EXISTS schoolregistrationcompletionstatus")
    op.drop_column("registration_exams", "requires_completion_confirmation")
