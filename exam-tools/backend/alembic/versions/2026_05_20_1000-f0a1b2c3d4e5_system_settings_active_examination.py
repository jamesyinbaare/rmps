"""Add system_settings with active_examination_id for staff default examination.

Revision ID: f0a1b2c3d4e5
Revises: e7f8a9b0c1d2
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa


revision = "f0a1b2c3d4e5"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("active_examination_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["active_examination_id"],
            ["examinations.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO system_settings (id, active_examination_id) VALUES (1, NULL)")


def downgrade() -> None:
    op.drop_table("system_settings")
