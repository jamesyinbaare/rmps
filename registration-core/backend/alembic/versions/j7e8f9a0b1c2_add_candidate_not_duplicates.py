"""Add registration_candidate_not_duplicates table

Revision ID: j7e8f9a0b1c2
Revises: i6d7e8f9a0b1
Create Date: 2026-03-21 16:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "j7e8f9a0b1c2"
down_revision: Union[str, Sequence[str], None] = "i6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "registration_candidate_not_duplicates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "candidate_a_id",
            sa.Integer(),
            sa.ForeignKey("registration_candidates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "candidate_b_id",
            sa.Integer(),
            sa.ForeignKey("registration_candidates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("candidate_a_id", "candidate_b_id", name="uq_candidate_not_duplicate_pair"),
    )
    op.create_index(
        "ix_registration_candidate_not_duplicates_school_id",
        "registration_candidate_not_duplicates",
        ["school_id"],
    )
    op.create_index(
        "ix_registration_candidate_not_duplicates_candidate_a_id",
        "registration_candidate_not_duplicates",
        ["candidate_a_id"],
    )
    op.create_index(
        "ix_registration_candidate_not_duplicates_candidate_b_id",
        "registration_candidate_not_duplicates",
        ["candidate_b_id"],
    )
    op.create_index(
        "ix_registration_candidate_not_duplicates_created_by_user_id",
        "registration_candidate_not_duplicates",
        ["created_by_user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_registration_candidate_not_duplicates_created_by_user_id",
        table_name="registration_candidate_not_duplicates",
    )
    op.drop_index(
        "ix_registration_candidate_not_duplicates_candidate_b_id",
        table_name="registration_candidate_not_duplicates",
    )
    op.drop_index(
        "ix_registration_candidate_not_duplicates_candidate_a_id",
        table_name="registration_candidate_not_duplicates",
    )
    op.drop_index(
        "ix_registration_candidate_not_duplicates_school_id",
        table_name="registration_candidate_not_duplicates",
    )
    op.drop_table("registration_candidate_not_duplicates")
