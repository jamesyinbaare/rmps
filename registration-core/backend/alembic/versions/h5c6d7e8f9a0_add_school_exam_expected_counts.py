"""Add school exam expected registration counts

Revision ID: h5c6d7e8f9a0
Revises: g4b5c6d7e8f9
Create Date: 2026-03-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h5c6d7e8f9a0"
down_revision: Union[str, Sequence[str], None] = "g4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exam_eligible_schools", sa.Column("expected_total", sa.Integer(), nullable=True))
    op.add_column("exam_eligible_schools", sa.Column("expected_declared_at", sa.DateTime(), nullable=True))
    op.add_column(
        "exam_eligible_schools",
        sa.Column(
            "expected_declared_by_user_id",
            sa.UUID(),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_exam_eligible_schools_expected_declared_by_user_id",
        "exam_eligible_schools",
        ["expected_declared_by_user_id"],
    )

    op.create_table(
        "exam_school_programme_expectations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "exam_id",
            sa.Integer(),
            sa.ForeignKey("registration_exams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "school_id",
            sa.Integer(),
            sa.ForeignKey("schools.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "programme_id",
            sa.Integer(),
            sa.ForeignKey("programmes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expected_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "exam_id",
            "school_id",
            "programme_id",
            name="uq_exam_school_programme_expectation",
        ),
    )
    op.create_index(
        "ix_exam_school_programme_expectations_exam_id",
        "exam_school_programme_expectations",
        ["exam_id"],
    )
    op.create_index(
        "ix_exam_school_programme_expectations_school_id",
        "exam_school_programme_expectations",
        ["school_id"],
    )
    op.create_index(
        "ix_exam_school_programme_expectations_programme_id",
        "exam_school_programme_expectations",
        ["programme_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_exam_school_programme_expectations_programme_id",
        table_name="exam_school_programme_expectations",
    )
    op.drop_index(
        "ix_exam_school_programme_expectations_school_id",
        table_name="exam_school_programme_expectations",
    )
    op.drop_index(
        "ix_exam_school_programme_expectations_exam_id",
        table_name="exam_school_programme_expectations",
    )
    op.drop_table("exam_school_programme_expectations")

    op.drop_index(
        "ix_exam_eligible_schools_expected_declared_by_user_id",
        table_name="exam_eligible_schools",
    )
    op.drop_column("exam_eligible_schools", "expected_declared_by_user_id")
    op.drop_column("exam_eligible_schools", "expected_declared_at")
    op.drop_column("exam_eligible_schools", "expected_total")
