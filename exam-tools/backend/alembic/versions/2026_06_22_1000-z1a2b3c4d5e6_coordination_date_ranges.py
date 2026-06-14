"""Coordination start/end dates; examiner portal release settings.

Revision ID: z1a2b3c4d5e6
Revises: y0z1a2b3c4d5
Create Date: 2026-06-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "z1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "y0z1a2b3c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subject_marking_groups",
        sa.Column("coordination_start_date", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "subject_marking_groups",
        sa.Column("coordination_end_date", sa.DateTime(), nullable=True),
    )
    op.execute(
        """
        UPDATE subject_marking_groups
        SET coordination_start_date = coordination_date,
            coordination_end_date = coordination_date
        WHERE coordination_date IS NOT NULL
        """
    )
    op.drop_column("subject_marking_groups", "coordination_date")

    op.add_column(
        "examiner_invitations",
        sa.Column("coordination_start_date", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "examiner_invitations",
        sa.Column("coordination_start_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "examiner_invitations",
        sa.Column("coordination_end_date", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "examiner_invitations",
        sa.Column("coordination_end_time", sa.Time(), nullable=True),
    )
    op.execute(
        """
        UPDATE examiner_invitations
        SET coordination_start_date = coordination_date,
            coordination_end_date = coordination_date
        WHERE coordination_date IS NOT NULL
        """
    )
    op.drop_column("examiner_invitations", "coordination_date")

    op.create_table(
        "examination_examiner_portal_settings",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column(
            "appointment_letters_release_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id"),
    )
    op.add_column(
        "examiners",
        sa.Column("appointment_letter_notified_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("examiners", "appointment_letter_notified_at")
    op.drop_table("examination_examiner_portal_settings")

    op.add_column(
        "examiner_invitations",
        sa.Column("coordination_date", sa.DateTime(), nullable=True),
    )
    op.execute(
        """
        UPDATE examiner_invitations
        SET coordination_date = coordination_start_date
        WHERE coordination_start_date IS NOT NULL
        """
    )
    op.drop_column("examiner_invitations", "coordination_end_time")
    op.drop_column("examiner_invitations", "coordination_end_date")
    op.drop_column("examiner_invitations", "coordination_start_time")
    op.drop_column("examiner_invitations", "coordination_start_date")

    op.add_column(
        "subject_marking_groups",
        sa.Column("coordination_date", sa.DateTime(), nullable=True),
    )
    op.execute(
        """
        UPDATE subject_marking_groups
        SET coordination_date = coordination_start_date
        WHERE coordination_start_date IS NOT NULL
        """
    )
    op.drop_column("subject_marking_groups", "coordination_end_date")
    op.drop_column("subject_marking_groups", "coordination_start_date")
