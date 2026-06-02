"""Add centre_locations for GPS coordinates keyed by centre code.

Revision ID: a1b2c3d4e5f9
Revises: f1a2b3c4d5e7
Create Date: 2026-06-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "a1b2c3d4e5f9"
down_revision: Union[str, None] = "f1a2b3c4d5e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "centre_locations",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("centre_code", sa.String(length=32), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("captured_at", sa.DateTime(), nullable=False),
        sa.Column("captured_by_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "latitude >= -90 AND latitude <= 90",
            name="ck_centre_locations_latitude",
        ),
        sa.CheckConstraint(
            "longitude >= -180 AND longitude <= 180",
            name="ck_centre_locations_longitude",
        ),
        sa.ForeignKeyConstraint(["captured_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("centre_code", name="uq_centre_locations_centre_code"),
    )
    op.create_index("ix_centre_locations_centre_code", "centre_locations", ["centre_code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_centre_locations_centre_code", table_name="centre_locations")
    op.drop_table("centre_locations")
