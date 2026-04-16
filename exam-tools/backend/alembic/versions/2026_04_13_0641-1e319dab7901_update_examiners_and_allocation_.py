"""Move examiners from allocation campaigns to examinations.

Revision ID: 1e319dab7901
Revises: 5afd55a452a4
Create Date: 2026-04-13 06:41:16.212637

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "1e319dab7901"
down_revision: Union[str, Sequence[str], None] = "5afd55a452a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("examiners", sa.Column("examination_id", sa.Integer(), nullable=True))
    op.execute(
        text(
            """
            UPDATE examiners AS e
            SET examination_id = ac.examination_id
            FROM allocation_campaigns AS ac
            WHERE e.campaign_id = ac.id
            """
        )
    )
    # Rows with no matching campaign (inconsistent DB) cannot be migrated.
    op.execute(text("DELETE FROM examiners WHERE examination_id IS NULL"))
    op.alter_column("examiners", "examination_id", existing_type=sa.Integer(), nullable=False)
    op.create_index(op.f("ix_examiners_examination_id"), "examiners", ["examination_id"], unique=False)
    op.create_foreign_key(
        "examiners_examination_id_fkey",
        "examiners",
        "examinations",
        ["examination_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_index(op.f("ix_examiners_campaign_id"), table_name="examiners")
    op.drop_constraint(op.f("examiners_campaign_id_fkey"), "examiners", type_="foreignkey")
    op.drop_column("examiners", "campaign_id")


def downgrade() -> None:
    op.add_column(
        "examiners",
        sa.Column("campaign_id", sa.UUID(), autoincrement=False, nullable=True),
    )
    op.drop_constraint("examiners_examination_id_fkey", "examiners", type_="foreignkey")
    op.drop_index(op.f("ix_examiners_examination_id"), table_name="examiners")
    op.create_index(op.f("ix_examiners_campaign_id"), "examiners", ["campaign_id"], unique=False)
    op.create_foreign_key(
        op.f("examiners_campaign_id_fkey"),
        "examiners",
        "allocation_campaigns",
        ["campaign_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_column("examiners", "examination_id")
