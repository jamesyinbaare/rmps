"""Add allocation examiners and require subject/paper.

Revision ID: 9c1b2f7d4a10
Revises: 1e319dab7901
Create Date: 2026-04-13 19:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "9c1b2f7d4a10"
down_revision: Union[str, Sequence[str], None] = "1e319dab7901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        text(
            """
            DELETE FROM allocation_campaigns
            WHERE subject_id IS NULL OR paper_number IS NULL
            """
        )
    )
    op.alter_column("allocation_campaigns", "subject_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("allocation_campaigns", "paper_number", existing_type=sa.SmallInteger(), nullable=False)

    op.create_table(
        "allocation_examiners",
        sa.Column("allocation_id", sa.UUID(), nullable=False),
        sa.Column("examiner_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["allocation_id"], ["allocation_campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("allocation_id", "examiner_id"),
    )
    op.create_index(
        op.f("ix_allocation_examiners_examiner_id"),
        "allocation_examiners",
        ["examiner_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_allocation_examiners_examiner_id"), table_name="allocation_examiners")
    op.drop_table("allocation_examiners")
    op.alter_column("allocation_campaigns", "paper_number", existing_type=sa.SmallInteger(), nullable=True)
    op.alter_column("allocation_campaigns", "subject_id", existing_type=sa.Integer(), nullable=True)
