"""Per-subject DAC settings and configurable appointment letter release.

Revision ID: f1a2b3c4d5e8
Revises: e2f3a4b5c6d7
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e8"
down_revision: str | Sequence[str] | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_examiner_appointment_letter_subject_settings",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("director_assessment_name", sa.String(length=255), nullable=True),
        sa.Column("director_assessment_title", sa.String(length=255), nullable=True),
        sa.Column("director_assessment_signature_path", sa.String(length=512), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("examination_id", "subject_id"),
    )

    op.add_column(
        "examination_examiner_portal_settings",
        sa.Column(
            "appointment_letters_release_mode",
            sa.String(length=32),
            nullable=False,
            server_default="scheduled_date",
        ),
    )
    op.add_column(
        "examination_examiner_portal_settings",
        sa.Column("appointment_letters_release_at", sa.DateTime(), nullable=True),
    )
    op.alter_column(
        "examination_examiner_portal_settings",
        "appointment_letters_release_mode",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("examination_examiner_portal_settings", "appointment_letters_release_at")
    op.drop_column("examination_examiner_portal_settings", "appointment_letters_release_mode")
    op.drop_table("examination_examiner_appointment_letter_subject_settings")
