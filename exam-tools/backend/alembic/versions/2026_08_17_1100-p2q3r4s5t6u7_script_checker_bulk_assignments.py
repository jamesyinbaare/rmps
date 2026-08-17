"""Add script_checker_bulk_assignments and fold existing checker batches.

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "p2q3r4s5t6u7"
down_revision: str | Sequence[str] | None = "o1p2q3r4s5t6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "script_checker_bulk_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("checker_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paper1_script_count", sa.Integer(), nullable=False),
        sa.Column("paper2_script_count", sa.Integer(), nullable=False),
        sa.Column("num_days", sa.SmallInteger(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.Column("assigned_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint("paper1_script_count >= 0", name="ck_script_checker_bulk_p1"),
        sa.CheckConstraint("paper2_script_count >= 0", name="ck_script_checker_bulk_p2"),
        sa.CheckConstraint(
            "paper1_script_count + paper2_script_count >= 1",
            name="ck_script_checker_bulk_has_scripts",
        ),
        sa.CheckConstraint("num_days >= 1", name="ck_script_checker_bulk_num_days"),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["checker_id"], ["script_checkers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "checker_id",
            name="uq_script_checker_bulk_assignment_exam_checker",
        ),
    )
    op.create_index(
        op.f("ix_script_checker_bulk_assignments_examination_id"),
        "script_checker_bulk_assignments",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_script_checker_bulk_assignments_checker_id"),
        "script_checker_bulk_assignments",
        ["checker_id"],
        unique=True,
    )

    op.execute(
        sa.text(
            """
            INSERT INTO script_checker_bulk_assignments (
                id,
                examination_id,
                checker_id,
                paper1_script_count,
                paper2_script_count,
                num_days,
                assigned_at,
                assigned_by_user_id,
                updated_at,
                updated_by_user_id
            )
            SELECT
                gen_random_uuid(),
                examination_id,
                checker_id,
                COALESCE(SUM(CASE WHEN paper_number = 1 THEN script_count ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN paper_number >= 2 THEN script_count ELSE 0 END), 0),
                GREATEST(COALESCE(MAX(num_days), 1), 1),
                MIN(assigned_at),
                (array_agg(assigned_by_user_id ORDER BY assigned_at ASC))[1],
                NOW(),
                (array_agg(assigned_by_user_id ORDER BY assigned_at ASC))[1]
            FROM script_checker_assignment_batches
            WHERE status <> 'cancelled'
            GROUP BY examination_id, checker_id
            HAVING SUM(script_count) >= 1
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_script_checker_bulk_assignments_checker_id"),
        table_name="script_checker_bulk_assignments",
    )
    op.drop_index(
        op.f("ix_script_checker_bulk_assignments_examination_id"),
        table_name="script_checker_bulk_assignments",
    )
    op.drop_table("script_checker_bulk_assignments")
