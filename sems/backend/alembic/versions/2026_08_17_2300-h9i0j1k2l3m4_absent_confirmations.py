"""Add subject_score_absent_confirmations table.

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-08-17 23:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h9i0j1k2l3m4"
down_revision: str | Sequence[str] | None = "g8h9i0j1k2l3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subject_score_absent_confirmations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject_score_id", sa.Integer(), nullable=False),
        sa.Column("field_name", sa.String(length=20), nullable=False),
        sa.Column("test_type", sa.Integer(), nullable=False),
        sa.Column("confirmed_by_user_id", sa.UUID(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_score_id"], ["subject_scores.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subject_score_id", "field_name", name="uq_absent_confirmation_score_field"),
    )
    op.create_index(
        op.f("ix_subject_score_absent_confirmations_subject_score_id"),
        "subject_score_absent_confirmations",
        ["subject_score_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_subject_score_absent_confirmations_confirmed_by_user_id"),
        "subject_score_absent_confirmations",
        ["confirmed_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_subject_score_absent_confirmations_confirmed_by_user_id"),
        table_name="subject_score_absent_confirmations",
    )
    op.drop_index(
        op.f("ix_subject_score_absent_confirmations_subject_score_id"),
        table_name="subject_score_absent_confirmations",
    )
    op.drop_table("subject_score_absent_confirmations")
