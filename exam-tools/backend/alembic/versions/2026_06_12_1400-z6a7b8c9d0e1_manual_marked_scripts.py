"""Manual marked scripts per subject (payout source mode + manual counts).

Revision ID: z6a7b8c9d0e1
Revises: z5a6b7c8d9e0
Create Date: 2026-06-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "z6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "z5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

marking_script_source_mode = postgresql.ENUM(
    "allocation",
    "manual",
    name="markingscriptsourcemode",
    create_type=False,
)


def upgrade() -> None:
    marking_script_source_mode.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "examination_subject_marking_script_sources",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column(
            "source_mode",
            marking_script_source_mode,
            nullable=False,
            server_default="allocation",
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("examination_id", "subject_id"),
    )

    op.create_table(
        "examination_examiner_manual_marked_scripts",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("examiner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paper_number", sa.Integer(), nullable=False),
        sa.Column("script_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.CheckConstraint("paper_number >= 1", name="ck_manual_marked_scripts_paper_number"),
        sa.CheckConstraint("script_count >= 0", name="ck_manual_marked_scripts_count_nonneg"),
        sa.PrimaryKeyConstraint("examination_id", "subject_id", "examiner_id", "paper_number"),
    )


def downgrade() -> None:
    op.drop_table("examination_examiner_manual_marked_scripts")
    op.drop_table("examination_subject_marking_script_sources")
    marking_script_source_mode.drop(op.get_bind(), checkfirst=True)
