"""examiner bank accounts

Revision ID: a7b8c9d0e1f2
Revises: f6a7b0c1d2e3
Create Date: 2026-06-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "examiner_bank_accounts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examiner_id", sa.UUID(), nullable=False),
        sa.Column("bank_branch_id", sa.UUID(), nullable=False),
        sa.Column("account_number", sa.String(length=13), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["bank_branch_id"], ["bank_branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("examiner_id", name="uq_examiner_bank_accounts_examiner_id"),
    )
    op.create_index(
        op.f("ix_examiner_bank_accounts_examiner_id"),
        "examiner_bank_accounts",
        ["examiner_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_examiner_bank_accounts_bank_branch_id"),
        "examiner_bank_accounts",
        ["bank_branch_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_examiner_bank_accounts_bank_branch_id"), table_name="examiner_bank_accounts")
    op.drop_index(op.f("ix_examiner_bank_accounts_examiner_id"), table_name="examiner_bank_accounts")
    op.drop_table("examiner_bank_accounts")
