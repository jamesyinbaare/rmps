"""Add examinations and examination_schedules

Revision ID: a1b2c3d4e5f6
Revises: e4ed5f71b375
Create Date: 2026-04-04 15:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "e4ed5f71b375"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "examinations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("exam_type", sa.String(length=50), nullable=False),
        sa.Column("exam_series", sa.String(length=20), nullable=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "examination_schedules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_code", sa.String(length=50), nullable=False),
        sa.Column("subject_name", sa.String(length=255), nullable=False),
        sa.Column("papers", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("venue", sa.String(length=255), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("examination_id", "subject_code", name="uq_examination_subject_schedule"),
    )
    op.create_index(
        op.f("ix_examination_schedules_examination_id"),
        "examination_schedules",
        ["examination_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_examination_schedules_examination_id"), table_name="examination_schedules")
    op.drop_table("examination_schedules")
    op.drop_table("examinations")
