"""sms_deliveries examiner_id for roster custom SMS

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sms_deliveries", sa.Column("examiner_id", sa.UUID(), nullable=True))
    op.create_index("ix_sms_deliveries_examiner_id", "sms_deliveries", ["examiner_id"])
    op.create_foreign_key(
        "fk_sms_deliveries_examiner_id",
        "sms_deliveries",
        "examiners",
        ["examiner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint("ck_sms_deliveries_recipient", "sms_deliveries", type_="check")
    op.create_check_constraint(
        "ck_sms_deliveries_recipient",
        "sms_deliveries",
        "user_id IS NOT NULL OR examiner_invitation_id IS NOT NULL OR examiner_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_sms_deliveries_recipient", "sms_deliveries", type_="check")
    op.create_check_constraint(
        "ck_sms_deliveries_recipient",
        "sms_deliveries",
        "user_id IS NOT NULL OR examiner_invitation_id IS NOT NULL",
    )
    op.drop_constraint("fk_sms_deliveries_examiner_id", "sms_deliveries", type_="foreignkey")
    op.drop_index("ix_sms_deliveries_examiner_id", table_name="sms_deliveries")
    op.drop_column("sms_deliveries", "examiner_id")
