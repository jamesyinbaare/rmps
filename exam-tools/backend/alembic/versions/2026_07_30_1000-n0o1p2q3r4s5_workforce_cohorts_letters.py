"""Workforce exercise cohorts, appointment letter settings, and OT/ST rates.

Revision ID: n0o1p2q3r4s5
Revises: m9n0o1p2q3r4
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n0o1p2q3r4s5"
down_revision: str | Sequence[str] | None = "m9n0o1p2q3r4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("script_checkers", sa.Column("appointment_letter_notified_at", sa.DateTime(), nullable=True))
    op.add_column("data_entry_clerks", sa.Column("appointment_letter_notified_at", sa.DateTime(), nullable=True))

    op.add_column(
        "examination_script_checker_rates",
        sa.Column(
            "objective_rate_per_script_ghs",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "examination_script_checker_rates",
        sa.Column(
            "subjective_rate_per_script_ghs",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        """
        UPDATE examination_script_checker_rates
        SET objective_rate_per_script_ghs = rate_per_script_ghs,
            subjective_rate_per_script_ghs = rate_per_script_ghs
        """
    )
    # Flat-rates migration created this under the temp table name; rename kept the constraint name.
    op.drop_constraint(
        "ck_examination_script_checker_rates_flat_nonneg",
        "examination_script_checker_rates",
        type_="check",
    )
    op.drop_column("examination_script_checker_rates", "rate_per_script_ghs")
    op.create_check_constraint(
        "ck_script_checker_rates_ot_nonneg",
        "examination_script_checker_rates",
        "objective_rate_per_script_ghs >= 0",
    )
    op.create_check_constraint(
        "ck_script_checker_rates_st_nonneg",
        "examination_script_checker_rates",
        "subjective_rate_per_script_ghs >= 0",
    )

    op.create_table(
        "workforce_exercise_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("exercise_start_date", sa.DateTime(), nullable=True),
        sa.Column("work_start_time", sa.Time(), nullable=True),
        sa.Column("work_end_time", sa.Time(), nullable=True),
        sa.Column("venue", sa.String(length=255), nullable=True),
        sa.Column(
            "appointment_letters_release_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "appointment_letters_release_mode",
            sa.String(length=32),
            server_default="scheduled_date",
            nullable=False,
        ),
        sa.Column("appointment_letters_release_at", sa.DateTime(), nullable=True),
        sa.Column("bank_details_editable", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("examination_id", "kind", "name", name="uq_workforce_exercise_groups_exam_kind_name"),
    )
    op.create_index(
        "ix_workforce_exercise_groups_examination_id",
        "workforce_exercise_groups",
        ["examination_id"],
    )
    op.create_index("ix_workforce_exercise_groups_kind", "workforce_exercise_groups", ["kind"])
    op.create_index(
        "uq_workforce_exercise_groups_default",
        "workforce_exercise_groups",
        ["examination_id", "kind"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    op.create_table(
        "workforce_exercise_group_members",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["workforce_exercise_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "person_id"),
    )
    op.create_index(
        "ix_workforce_exercise_group_members_examination_id",
        "workforce_exercise_group_members",
        ["examination_id"],
    )
    op.create_index(
        "ix_workforce_exercise_group_members_kind",
        "workforce_exercise_group_members",
        ["kind"],
    )
    op.create_index(
        "ix_workforce_exercise_group_members_person",
        "workforce_exercise_group_members",
        ["examination_id", "kind", "person_id"],
    )

    op.create_table(
        "examination_workforce_appointment_letter_settings",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column(
            "signing_official",
            sa.String(length=64),
            server_default="director_assessment_certification",
            nullable=False,
        ),
        sa.Column("signed_for_director_general", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("director_general_name", sa.String(length=255), nullable=True),
        sa.Column("director_general_title", sa.String(length=255), nullable=True),
        sa.Column("director_general_signature_path", sa.String(length=512), nullable=True),
        sa.Column("director_assessment_name", sa.String(length=255), nullable=True),
        sa.Column("director_assessment_title", sa.String(length=255), nullable=True),
        sa.Column("director_assessment_signature_path", sa.String(length=512), nullable=True),
        sa.Column("valediction", sa.String(length=255), server_default="Yours faithfully", nullable=False),
        sa.Column("letter_date", sa.Date(), nullable=True),
        sa.Column("reference_number", sa.String(length=128), nullable=True),
        sa.Column("cc_lines", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id", "kind"),
    )


def downgrade() -> None:
    op.drop_table("examination_workforce_appointment_letter_settings")
    op.drop_index("ix_workforce_exercise_group_members_person", table_name="workforce_exercise_group_members")
    op.drop_index("ix_workforce_exercise_group_members_kind", table_name="workforce_exercise_group_members")
    op.drop_index(
        "ix_workforce_exercise_group_members_examination_id",
        table_name="workforce_exercise_group_members",
    )
    op.drop_table("workforce_exercise_group_members")
    op.drop_index("uq_workforce_exercise_groups_default", table_name="workforce_exercise_groups")
    op.drop_index("ix_workforce_exercise_groups_kind", table_name="workforce_exercise_groups")
    op.drop_index("ix_workforce_exercise_groups_examination_id", table_name="workforce_exercise_groups")
    op.drop_table("workforce_exercise_groups")

    op.drop_constraint("ck_script_checker_rates_ot_nonneg", "examination_script_checker_rates", type_="check")
    op.drop_constraint("ck_script_checker_rates_st_nonneg", "examination_script_checker_rates", type_="check")
    op.add_column(
        "examination_script_checker_rates",
        sa.Column("rate_per_script_ghs", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.execute(
        """
        UPDATE examination_script_checker_rates
        SET rate_per_script_ghs = objective_rate_per_script_ghs
        """
    )
    op.create_check_constraint(
        "ck_examination_script_checker_rates_flat_nonneg",
        "examination_script_checker_rates",
        "rate_per_script_ghs >= 0",
    )
    op.drop_column("examination_script_checker_rates", "subjective_rate_per_script_ghs")
    op.drop_column("examination_script_checker_rates", "objective_rate_per_script_ghs")

    op.drop_column("data_entry_clerks", "appointment_letter_notified_at")
    op.drop_column("script_checkers", "appointment_letter_notified_at")
