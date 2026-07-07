"""Add per-cohort appointment letter and bank details release fields.

Revision ID: m9n0o1p2q3r4
Revises: g4h5i6j7k8l9
Create Date: 2026-07-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m9n0o1p2q3r4"
down_revision: str | Sequence[str] | None = "g4h5i6j7k8l9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subject_marking_groups",
        sa.Column(
            "appointment_letters_release_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column(
            "appointment_letters_release_mode",
            sa.String(length=32),
            nullable=False,
            server_default="scheduled_date",
        ),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column("appointment_letters_release_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column(
            "examiner_bank_details_editable_by_examiners",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE subject_marking_groups smg
            SET
                appointment_letters_release_enabled = eps.appointment_letters_release_enabled,
                appointment_letters_release_mode = eps.appointment_letters_release_mode,
                appointment_letters_release_at = eps.appointment_letters_release_at,
                examiner_bank_details_editable_by_examiners = eps.examiner_bank_details_editable_by_examiners
            FROM examination_examiner_portal_settings eps
            WHERE smg.examination_id = eps.examination_id
            """
        )
    )


def downgrade() -> None:
    op.drop_column("subject_marking_groups", "examiner_bank_details_editable_by_examiners")
    op.drop_column("subject_marking_groups", "appointment_letters_release_at")
    op.drop_column("subject_marking_groups", "appointment_letters_release_mode")
    op.drop_column("subject_marking_groups", "appointment_letters_release_enabled")
