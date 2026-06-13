"""Appointment letter references and coordination venue.

Revision ID: d5e6f7a8c0d1
Revises: c4d5e6f7a8c0
Create Date: 2026-06-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8c0d1"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_examiner_appointment_letter_references",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("examiner_type", sa.String(length=64), nullable=False),
        sa.Column("reference_number", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "subject_id",
            "examiner_type",
            name="uq_exam_examiner_appt_letter_refs",
        ),
    )
    op.create_index(
        op.f("ix_examination_examiner_appointment_letter_references_examination_id"),
        "examination_examiner_appointment_letter_references",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_examination_examiner_appointment_letter_references_subject_id"),
        "examination_examiner_appointment_letter_references",
        ["subject_id"],
        unique=False,
    )

    op.add_column(
        "examiner_invitations",
        sa.Column("coordination_venue", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column("coordination_venue", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subject_marking_groups", "coordination_venue")
    op.drop_column("examiner_invitations", "coordination_venue")
    op.drop_index(
        op.f("ix_examination_examiner_appointment_letter_references_subject_id"),
        table_name="examination_examiner_appointment_letter_references",
    )
    op.drop_index(
        op.f("ix_examination_examiner_appointment_letter_references_examination_id"),
        table_name="examination_examiner_appointment_letter_references",
    )
    op.drop_table("examination_examiner_appointment_letter_references")
