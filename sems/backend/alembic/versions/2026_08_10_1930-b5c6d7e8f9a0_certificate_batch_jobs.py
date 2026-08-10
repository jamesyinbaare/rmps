"""Add certificate_batch_jobs for Phase 3 batch issuance.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-08-10 19:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

batch_status = postgresql.ENUM(
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
    name="certificatebatchjobstatus",
    create_type=False,
)


def upgrade() -> None:
    batch_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "certificate_batch_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("status", batch_status, nullable=False),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "programme_id",
            sa.Integer(),
            sa.ForeignKey("programmes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "template_id",
            sa.Integer(),
            sa.ForeignKey("certificate_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("issuance_date", sa.Date(), nullable=True),
        sa.Column("only_fully_graded", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("reissue_existing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("progress_current", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("progress_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_candidate_name", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("results", sa.JSON(), nullable=True),
        sa.Column("zip_storage_path", sa.String(length=512), nullable=True),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_certificate_batch_jobs_status", "certificate_batch_jobs", ["status"])
    op.create_index("ix_certificate_batch_jobs_exam_id", "certificate_batch_jobs", ["exam_id"])
    op.create_index("ix_certificate_batch_jobs_school_id", "certificate_batch_jobs", ["school_id"])
    op.create_index("ix_certificate_batch_jobs_programme_id", "certificate_batch_jobs", ["programme_id"])
    op.create_index("ix_certificate_batch_jobs_created_at", "certificate_batch_jobs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_certificate_batch_jobs_created_at", table_name="certificate_batch_jobs")
    op.drop_index("ix_certificate_batch_jobs_programme_id", table_name="certificate_batch_jobs")
    op.drop_index("ix_certificate_batch_jobs_school_id", table_name="certificate_batch_jobs")
    op.drop_index("ix_certificate_batch_jobs_exam_id", table_name="certificate_batch_jobs")
    op.drop_index("ix_certificate_batch_jobs_status", table_name="certificate_batch_jobs")
    op.drop_table("certificate_batch_jobs")
    batch_status.drop(op.get_bind(), checkfirst=True)
