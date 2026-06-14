"""Script checkers, data entry clerks, batches, rates, SMS FKs.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-06-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b9c0d1e2f3a4"
down_revision: str | Sequence[str] | None = "a8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_batch_status = postgresql.ENUM("active", "completed", "cancelled", name="workforceassignmentbatchstatus", create_type=False)

_REGION_ENUM = postgresql.ENUM(
    "ASHANTI",
    "BONO",
    "BONO_EAST",
    "AHAFO",
    "CENTRAL",
    "EASTERN",
    "GREATER_ACCRA",
    "NORTHERN",
    "NORTH_EAST",
    "SAVANNAH",
    "UPPER_EAST",
    "UPPER_WEST",
    "VOLTA",
    "OTI",
    "WESTERN",
    "WESTERN_NORTH",
    name="region",
    create_type=False,
)


def upgrade() -> None:
    _batch_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "script_checkers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("phone_number", sa.String(length=50), nullable=True),
        sa.Column("region", _REGION_ENUM, nullable=True),
        sa.Column("reference_code", sa.String(length=64), nullable=True),
        sa.Column("portal_token", sa.String(length=128), nullable=False),
        sa.Column("portal_invite_sms_sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("examination_id", "reference_code", name="uq_script_checkers_examination_reference_code"),
        sa.UniqueConstraint("portal_token"),
    )
    op.create_index("ix_script_checkers_examination_id", "script_checkers", ["examination_id"])

    op.create_table(
        "data_entry_clerks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("phone_number", sa.String(length=50), nullable=True),
        sa.Column("region", _REGION_ENUM, nullable=True),
        sa.Column("reference_code", sa.String(length=64), nullable=True),
        sa.Column("portal_token", sa.String(length=128), nullable=False),
        sa.Column("portal_invite_sms_sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("examination_id", "reference_code", name="uq_data_entry_clerks_examination_reference_code"),
        sa.UniqueConstraint("portal_token"),
    )
    op.create_index("ix_data_entry_clerks_examination_id", "data_entry_clerks", ["examination_id"])

    op.create_table(
        "script_checker_bank_accounts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("checker_id", sa.UUID(), nullable=False),
        sa.Column("bank_branch_id", sa.UUID(), nullable=False),
        sa.Column("account_number", sa.String(length=13), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["bank_branch_id"], ["bank_branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["checker_id"], ["script_checkers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("checker_id"),
    )
    op.create_index("ix_script_checker_bank_accounts_checker_id", "script_checker_bank_accounts", ["checker_id"])

    op.create_table(
        "data_entry_clerk_bank_accounts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("clerk_id", sa.UUID(), nullable=False),
        sa.Column("bank_branch_id", sa.UUID(), nullable=False),
        sa.Column("account_number", sa.String(length=13), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["bank_branch_id"], ["bank_branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["clerk_id"], ["data_entry_clerks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clerk_id"),
    )
    op.create_index("ix_data_entry_clerk_bank_accounts_clerk_id", "data_entry_clerk_bank_accounts", ["clerk_id"])

    op.create_table(
        "script_checker_assignment_batches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("paper_number", sa.Integer(), nullable=False),
        sa.Column("checker_id", sa.UUID(), nullable=False),
        sa.Column("script_count", sa.Integer(), nullable=False),
        sa.Column("status", _batch_status, nullable=False, server_default="active"),
        sa.Column("batch_sequence", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.Column("assigned_by_user_id", sa.UUID(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_user_id", sa.UUID(), nullable=True),
        sa.CheckConstraint("paper_number >= 1", name="ck_script_checker_batches_paper"),
        sa.CheckConstraint("script_count >= 0", name="ck_script_checker_batches_count"),
        sa.CheckConstraint("batch_sequence >= 1", name="ck_script_checker_batches_sequence"),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["checker_id"], ["script_checkers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["completed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_script_checker_assignment_batches_checker_id", "script_checker_assignment_batches", ["checker_id"])
    op.create_index(
        "uq_script_checker_one_active_batch",
        "script_checker_assignment_batches",
        ["examination_id", "subject_id", "paper_number", "checker_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "data_entry_clerk_assignment_batches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("paper_number", sa.Integer(), nullable=False),
        sa.Column("clerk_id", sa.UUID(), nullable=False),
        sa.Column("script_count", sa.Integer(), nullable=False),
        sa.Column("status", _batch_status, nullable=False, server_default="active"),
        sa.Column("batch_sequence", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.Column("assigned_by_user_id", sa.UUID(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_user_id", sa.UUID(), nullable=True),
        sa.CheckConstraint("paper_number >= 1", name="ck_data_entry_clerk_batches_paper"),
        sa.CheckConstraint("script_count >= 0", name="ck_data_entry_clerk_batches_count"),
        sa.CheckConstraint("batch_sequence >= 1", name="ck_data_entry_clerk_batches_sequence"),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["clerk_id"], ["data_entry_clerks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["completed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_data_entry_clerk_assignment_batches_clerk_id", "data_entry_clerk_assignment_batches", ["clerk_id"])
    op.create_index(
        "uq_data_entry_clerk_one_active_batch",
        "data_entry_clerk_assignment_batches",
        ["examination_id", "subject_id", "paper_number", "clerk_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    op.create_table(
        "examination_script_checker_rates",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("paper_number", sa.Integer(), nullable=False),
        sa.Column("rate_per_script_ghs", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("paper_number >= 1", name="ck_script_checker_rates_paper"),
        sa.CheckConstraint("rate_per_script_ghs >= 0", name="ck_script_checker_rates_nonneg"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id", "subject_id", "paper_number"),
    )

    op.create_table(
        "examination_data_entry_clerk_rates",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("paper_number", sa.Integer(), nullable=False),
        sa.Column("rate_per_script_ghs", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("paper_number >= 1", name="ck_data_entry_clerk_rates_paper"),
        sa.CheckConstraint("rate_per_script_ghs >= 0", name="ck_data_entry_clerk_rates_nonneg"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id", "subject_id", "paper_number"),
    )

    op.add_column("sms_deliveries", sa.Column("script_checker_id", sa.UUID(), nullable=True))
    op.add_column("sms_deliveries", sa.Column("data_entry_clerk_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_sms_deliveries_script_checker_id",
        "sms_deliveries",
        "script_checkers",
        ["script_checker_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_sms_deliveries_data_entry_clerk_id",
        "sms_deliveries",
        "data_entry_clerks",
        ["data_entry_clerk_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_sms_deliveries_script_checker_id", "sms_deliveries", ["script_checker_id"])
    op.create_index("ix_sms_deliveries_data_entry_clerk_id", "sms_deliveries", ["data_entry_clerk_id"])
    op.drop_constraint("ck_sms_deliveries_recipient", "sms_deliveries", type_="check")
    op.create_check_constraint(
        "ck_sms_deliveries_recipient",
        "sms_deliveries",
        "user_id IS NOT NULL OR examiner_invitation_id IS NOT NULL OR examiner_id IS NOT NULL "
        "OR script_checker_id IS NOT NULL OR data_entry_clerk_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_sms_deliveries_recipient", "sms_deliveries", type_="check")
    op.create_check_constraint(
        "ck_sms_deliveries_recipient",
        "sms_deliveries",
        "user_id IS NOT NULL OR examiner_invitation_id IS NOT NULL OR examiner_id IS NOT NULL",
    )
    op.drop_index("ix_sms_deliveries_data_entry_clerk_id", table_name="sms_deliveries")
    op.drop_index("ix_sms_deliveries_script_checker_id", table_name="sms_deliveries")
    op.drop_constraint("fk_sms_deliveries_data_entry_clerk_id", "sms_deliveries", type_="foreignkey")
    op.drop_constraint("fk_sms_deliveries_script_checker_id", "sms_deliveries", type_="foreignkey")
    op.drop_column("sms_deliveries", "data_entry_clerk_id")
    op.drop_column("sms_deliveries", "script_checker_id")

    op.drop_table("examination_data_entry_clerk_rates")
    op.drop_table("examination_script_checker_rates")
    op.drop_index("uq_data_entry_clerk_one_active_batch", table_name="data_entry_clerk_assignment_batches")
    op.drop_table("data_entry_clerk_assignment_batches")
    op.drop_index("uq_script_checker_one_active_batch", table_name="script_checker_assignment_batches")
    op.drop_table("script_checker_assignment_batches")
    op.drop_table("data_entry_clerk_bank_accounts")
    op.drop_table("script_checker_bank_accounts")
    op.drop_table("data_entry_clerks")
    op.drop_table("script_checkers")
    _batch_status.drop(op.get_bind(), checkfirst=True)
