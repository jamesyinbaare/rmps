"""Add bank_branches and exam_school_officials

Revision ID: f8a9b0c1d2e3
Revises: c4d5e6f7a8b9
Create Date: 2026-05-15 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bank_branches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("bank_code", sa.String(length=6), nullable=False),
        sa.Column("bank_name", sa.String(length=255), nullable=False),
        sa.Column("branch_name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bank_code", name="uq_bank_branches_bank_code"),
    )

    op.create_table(
        "exam_school_officials",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("school_id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("designation", sa.String(length=64), nullable=False),
        sa.Column("bank_branch_id", sa.UUID(), nullable=False),
        sa.Column("account_number", sa.String(length=13), nullable=False),
        sa.Column("num_days", sa.SmallInteger(), nullable=False),
        sa.Column("telephone_number", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("num_days >= 1", name="ck_exam_school_official_num_days"),
        sa.CheckConstraint(
            "length(account_number) = 13 AND account_number ~ '^[0-9]{13}$'",
            name="ck_exam_school_official_account",
        ),
        sa.CheckConstraint(
            "telephone_number ~ '^0(20|23|24|25|26|27|28|29|50|54|55|56|57|59)[0-9]{7}$'",
            name="ck_exam_school_official_telephone_gh",
        ),
        sa.CheckConstraint(
            "designation IN ('Depot Keeper', 'Supervisor', 'Assistant Supervisor', 'Invigilator', 'Police Officer')",
            name="ck_exam_school_official_designation",
        ),
        sa.ForeignKeyConstraint(["bank_branch_id"], ["bank_branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exam_school_officials_exam_school",
        "exam_school_officials",
        ["examination_id", "school_id"],
        unique=False,
    )
    op.create_index(op.f("ix_exam_school_officials_examination_id"), "exam_school_officials", ["examination_id"], unique=False)
    op.create_index(op.f("ix_exam_school_officials_school_id"), "exam_school_officials", ["school_id"], unique=False)
    op.create_index(op.f("ix_exam_school_officials_bank_branch_id"), "exam_school_officials", ["bank_branch_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_exam_school_officials_bank_branch_id"), table_name="exam_school_officials")
    op.drop_index(op.f("ix_exam_school_officials_school_id"), table_name="exam_school_officials")
    op.drop_index(op.f("ix_exam_school_officials_examination_id"), table_name="exam_school_officials")
    op.drop_index("ix_exam_school_officials_exam_school", table_name="exam_school_officials")
    op.drop_table("exam_school_officials")
    op.drop_table("bank_branches")
