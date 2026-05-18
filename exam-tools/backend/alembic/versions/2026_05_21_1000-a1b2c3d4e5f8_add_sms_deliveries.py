"""add sms_deliveries

Revision ID: a1b2c3d4e5f8
Revises: ff1122334455
Create Date: 2026-05-21

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f8"
down_revision = "ff1122334455"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sms_deliveries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("phone_number", sa.String(length=50), nullable=False),
        sa.Column("msisdn", sa.String(length=20), nullable=False),
        sa.Column("message_type", sa.String(length=32), nullable=False),
        sa.Column("trigger", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("provider_response", sa.Text(), nullable=True),
        sa.Column("retried_from_id", sa.UUID(), nullable=True),
        sa.Column("triggered_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["retried_from_id"], ["sms_deliveries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sms_deliveries_created_at", "sms_deliveries", ["created_at"], unique=False)
    op.create_index("ix_sms_deliveries_retried_from_id", "sms_deliveries", ["retried_from_id"], unique=False)
    op.create_index("ix_sms_deliveries_status", "sms_deliveries", ["status"], unique=False)
    op.create_index(
        "ix_sms_deliveries_status_created_at", "sms_deliveries", ["status", "created_at"], unique=False
    )
    op.create_index("ix_sms_deliveries_triggered_by_user_id", "sms_deliveries", ["triggered_by_user_id"], unique=False)
    op.create_index("ix_sms_deliveries_user_id", "sms_deliveries", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sms_deliveries_user_id", table_name="sms_deliveries")
    op.drop_index("ix_sms_deliveries_triggered_by_user_id", table_name="sms_deliveries")
    op.drop_index("ix_sms_deliveries_status_created_at", table_name="sms_deliveries")
    op.drop_index("ix_sms_deliveries_status", table_name="sms_deliveries")
    op.drop_index("ix_sms_deliveries_retried_from_id", table_name="sms_deliveries")
    op.drop_index("ix_sms_deliveries_created_at", table_name="sms_deliveries")
    op.drop_table("sms_deliveries")
