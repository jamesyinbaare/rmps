"""Add examination allowance groups for gating examiner allowances.

Revision ID: y2z3a4b5c6d7
Revises: x1y2z3a4b5c6
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "y2z3a4b5c6d7"
down_revision: str | Sequence[str] | None = "x1y2z3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ALLOWANCE_KEYS = (
    "responsibility",
    "inconvenience",
    "chief_examiners_report",
    "vetting",
    "internal_commuting",
    "sitting",
    "marking",
    "travel",
)


def upgrade() -> None:
    op.create_table(
        "examination_allowance_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_general", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("examination_id", "name", name="uq_exam_allowance_group_name"),
    )
    op.create_index(
        "ix_examination_allowance_groups_examination_id",
        "examination_allowance_groups",
        ["examination_id"],
    )
    op.create_index(
        "uq_exam_allowance_group_general",
        "examination_allowance_groups",
        ["examination_id"],
        unique=True,
        postgresql_where=sa.text("is_general = true"),
    )

    op.create_table(
        "examination_allowance_group_members",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examiner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["examiner_id"],
            ["examiners.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["examination_allowance_groups.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("group_id", "examiner_id"),
    )
    op.create_index(
        "ix_examination_allowance_group_members_examiner_id",
        "examination_allowance_group_members",
        ["examiner_id"],
    )

    op.create_table(
        "examination_allowance_group_eligibility",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("allowance_key", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["examination_allowance_groups.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "allowance_key", name="uq_exam_allowance_group_eligibility"),
    )
    op.create_index(
        "ix_examination_allowance_group_eligibility_group_id",
        "examination_allowance_group_eligibility",
        ["group_id"],
    )

    # Bootstrap General group + all-enabled eligibility + membership for every examiner.
    conn = op.get_bind()
    exams = conn.execute(sa.text("SELECT id FROM examinations")).fetchall()
    for (exam_id,) in exams:
        group_id = conn.execute(
            sa.text(
                """
                INSERT INTO examination_allowance_groups
                    (id, examination_id, name, is_general, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), :exam_id, 'General', true, NOW(), NOW())
                RETURNING id
                """
            ),
            {"exam_id": exam_id},
        ).scalar_one()
        for key in _ALLOWANCE_KEYS:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO examination_allowance_group_eligibility
                        (id, group_id, allowance_key, enabled, created_at, updated_at)
                    VALUES
                        (gen_random_uuid(), :group_id, :key, true, NOW(), NOW())
                    """
                ),
                {"group_id": group_id, "key": key},
            )
        conn.execute(
            sa.text(
                """
                INSERT INTO examination_allowance_group_members (group_id, examiner_id, created_at)
                SELECT :group_id, e.id, NOW()
                FROM examiners e
                WHERE e.examination_id = :exam_id
                """
            ),
            {"group_id": group_id, "exam_id": exam_id},
        )


def downgrade() -> None:
    op.drop_table("examination_allowance_group_eligibility")
    op.drop_table("examination_allowance_group_members")
    op.drop_index("uq_exam_allowance_group_general", table_name="examination_allowance_groups")
    op.drop_index("ix_examination_allowance_groups_examination_id", table_name="examination_allowance_groups")
    op.drop_table("examination_allowance_groups")
