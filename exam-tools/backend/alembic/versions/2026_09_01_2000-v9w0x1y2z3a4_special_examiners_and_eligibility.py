"""Special examiners, roster allowance eligibility, payout override redesign.

Revision ID: v9w0x1y2z3a4
Revises: u8v9w0x1y2z3
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "v9w0x1y2z3a4"
down_revision: str | Sequence[str] | None = "u8v9w0x1y2z3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQL requires enum additions to commit before the new value is usable.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE examinerrostersource ADD VALUE IF NOT EXISTS 'special'"))

    op.execute(
        sa.text(
            "UPDATE examiners SET roster_source = 'special' WHERE roster_source = 'payout_override'"
        )
    )

    op.create_table(
        "examination_roster_allowance_eligibility",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("roster_source", sa.String(length=32), nullable=False),
        sa.Column("allowance_key", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["examination_id"],
            ["examinations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "roster_source",
            "allowance_key",
            name="uq_exam_roster_allowance_eligibility",
        ),
    )
    op.create_index(
        "ix_examination_roster_allowance_eligibility_examination_id",
        "examination_roster_allowance_eligibility",
        ["examination_id"],
    )

    op.add_column(
        "examiner_payout_overrides",
        sa.Column("description", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "examiner_payout_overrides",
        sa.Column("paper_1_script_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "examiner_payout_overrides",
        sa.Column("paper_2_script_count", sa.Integer(), nullable=False, server_default="0"),
    )

    op.execute(
        sa.text(
            """
            UPDATE examiner_payout_overrides
            SET paper_1_script_count = script_count
            WHERE paper_number = 1
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE examiner_payout_overrides
            SET paper_2_script_count = script_count
            WHERE paper_number = 2
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE examiner_payout_overrides
            SET paper_1_script_count = script_count
            WHERE paper_number NOT IN (1, 2) AND COALESCE(script_count, 0) > 0
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE examiner_payout_overrides o
            SET description = COALESCE(s.name, s.code, s.original_code)
            FROM subjects s
            WHERE o.subject_id = s.id
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM examiner_payout_overrides
            WHERE COALESCE(script_count, 0) = 0
               OR (paper_1_script_count = 0 AND paper_2_script_count = 0)
            """
        )
    )

    op.drop_constraint(
        "fk_examiner_payout_overrides_subject_id",
        "examiner_payout_overrides",
        type_="foreignkey",
    )
    op.drop_index("ix_examiner_payout_overrides_subject_id", table_name="examiner_payout_overrides")
    op.drop_constraint("ck_examiner_payout_override_paper_number", "examiner_payout_overrides", type_="check")
    op.drop_constraint("ck_examiner_payout_override_script_count", "examiner_payout_overrides", type_="check")
    op.drop_column("examiner_payout_overrides", "subject_id")
    op.drop_column("examiner_payout_overrides", "paper_number")
    op.drop_column("examiner_payout_overrides", "script_count")

    op.create_check_constraint(
        "ck_examiner_payout_override_p1_script_count",
        "examiner_payout_overrides",
        "paper_1_script_count >= 0",
    )
    op.create_check_constraint(
        "ck_examiner_payout_override_p2_script_count",
        "examiner_payout_overrides",
        "paper_2_script_count >= 0",
    )
    op.create_check_constraint(
        "ck_examiner_payout_override_has_scripts",
        "examiner_payout_overrides",
        "paper_1_script_count > 0 OR paper_2_script_count > 0",
    )

    op.alter_column("examiner_payout_overrides", "paper_1_script_count", server_default=None)
    op.alter_column("examiner_payout_overrides", "paper_2_script_count", server_default=None)


def downgrade() -> None:
    op.drop_constraint("ck_examiner_payout_override_has_scripts", "examiner_payout_overrides", type_="check")
    op.drop_constraint("ck_examiner_payout_override_p2_script_count", "examiner_payout_overrides", type_="check")
    op.drop_constraint("ck_examiner_payout_override_p1_script_count", "examiner_payout_overrides", type_="check")

    op.add_column(
        "examiner_payout_overrides",
        sa.Column("script_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "examiner_payout_overrides",
        sa.Column("paper_number", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "examiner_payout_overrides",
        sa.Column("subject_id", sa.Integer(), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE examiner_payout_overrides
            SET script_count = CASE
                WHEN paper_2_script_count > 0 THEN paper_2_script_count
                ELSE paper_1_script_count
            END,
            paper_number = CASE
                WHEN paper_2_script_count > 0 AND paper_1_script_count = 0 THEN 2
                ELSE 1
            END
            """
        )
    )

    op.drop_column("examiner_payout_overrides", "paper_1_script_count")
    op.drop_column("examiner_payout_overrides", "paper_2_script_count")
    op.drop_column("examiner_payout_overrides", "description")

    op.create_check_constraint(
        "ck_examiner_payout_override_script_count",
        "examiner_payout_overrides",
        "script_count >= 0",
    )
    op.create_check_constraint(
        "ck_examiner_payout_override_paper_number",
        "examiner_payout_overrides",
        "paper_number >= 1",
    )

    op.drop_index(
        "ix_examination_roster_allowance_eligibility_examination_id",
        table_name="examination_roster_allowance_eligibility",
    )
    op.drop_table("examination_roster_allowance_eligibility")

    op.execute(
        sa.text(
            "UPDATE examiners SET roster_source = 'payout_override' WHERE roster_source = 'special'"
        )
    )
