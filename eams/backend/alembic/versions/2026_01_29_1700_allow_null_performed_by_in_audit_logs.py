"""Allow null performed_by_user_id in allocation_audit_logs

Revision ID: f7e6d5c4b3a2
Revises: 0b1883035216
Create Date: 2026-01-29 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f7e6d5c4b3a2"
down_revision: Union[str, None] = "0b1883035216"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "allocation_audit_logs",
        "performed_by_user_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "allocation_audit_logs",
        "performed_by_user_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
