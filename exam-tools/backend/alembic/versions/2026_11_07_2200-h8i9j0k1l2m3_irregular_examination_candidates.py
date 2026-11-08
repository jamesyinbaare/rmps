"""Add irregular examination candidates and per-exam toggle.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-11-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h8i9j0k1l2m3"
down_revision: str | Sequence[str] | None = "g7h8i9j0k1l2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "examination_inspector_submission_settings",
        sa.Column(
            "irregular_candidates_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )

    op.create_table(
        "irregular_examination_candidates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("examination_centre_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("school_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("programme_id", sa.Integer(), nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("last_name", sa.String(length=255), nullable=False),
        sa.Column("other_name", sa.String(length=255), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("phone_number", sa.String(length=10), nullable=False),
        sa.Column("guardian_name", sa.String(length=512), nullable=True),
        sa.Column("guardian_phone_number", sa.String(length=10), nullable=True),
        sa.Column("ghanapost_gps_address", sa.String(length=50), nullable=True),
        sa.Column("photograph_stored_path", sa.String(length=512), nullable=False),
        sa.Column("voucher_stored_path", sa.String(length=512), nullable=False),
        sa.Column("recorded_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "phone_number ~ '^[0-9]{10}$'",
            name="ck_irregular_candidate_phone_number",
        ),
        sa.CheckConstraint(
            "guardian_phone_number IS NULL OR guardian_phone_number ~ '^[0-9]{10}$'",
            name="ck_irregular_candidate_guardian_phone",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["examination_centre_id"],
            ["examination_centres.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_irregular_examination_candidates_examination_id"),
        "irregular_examination_candidates",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_examination_candidates_examination_centre_id"),
        "irregular_examination_candidates",
        ["examination_centre_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_examination_candidates_school_id"),
        "irregular_examination_candidates",
        ["school_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_examination_candidates_programme_id"),
        "irregular_examination_candidates",
        ["programme_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_examination_candidates_recorded_by_user_id"),
        "irregular_examination_candidates",
        ["recorded_by_user_id"],
        unique=False,
    )

    op.create_table(
        "irregular_examination_candidate_subjects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("irregular_examination_candidate_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=True),
        sa.Column("subject_code", sa.String(length=50), nullable=False),
        sa.Column("subject_name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["irregular_examination_candidate_id"],
            ["irregular_examination_candidates.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "irregular_examination_candidate_id",
            "subject_code",
            name="uq_irregular_candidate_subject_code",
        ),
    )
    op.create_index(
        op.f("ix_irregular_examination_candidate_subjects_candidate_id"),
        "irregular_examination_candidate_subjects",
        ["irregular_examination_candidate_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_examination_candidate_subjects_subject_id"),
        "irregular_examination_candidate_subjects",
        ["subject_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_irregular_examination_candidate_subjects_subject_id"),
        table_name="irregular_examination_candidate_subjects",
    )
    op.drop_index(
        op.f("ix_irregular_examination_candidate_subjects_candidate_id"),
        table_name="irregular_examination_candidate_subjects",
    )
    op.drop_table("irregular_examination_candidate_subjects")

    op.drop_index(
        op.f("ix_irregular_examination_candidates_recorded_by_user_id"),
        table_name="irregular_examination_candidates",
    )
    op.drop_index(
        op.f("ix_irregular_examination_candidates_programme_id"),
        table_name="irregular_examination_candidates",
    )
    op.drop_index(
        op.f("ix_irregular_examination_candidates_school_id"),
        table_name="irregular_examination_candidates",
    )
    op.drop_index(
        op.f("ix_irregular_examination_candidates_examination_centre_id"),
        table_name="irregular_examination_candidates",
    )
    op.drop_index(
        op.f("ix_irregular_examination_candidates_examination_id"),
        table_name="irregular_examination_candidates",
    )
    op.drop_table("irregular_examination_candidates")

    op.drop_column("examination_inspector_submission_settings", "irregular_candidates_enabled")
