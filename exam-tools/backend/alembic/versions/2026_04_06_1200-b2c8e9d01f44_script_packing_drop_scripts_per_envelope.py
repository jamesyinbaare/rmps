"""Drop scripts_per_envelope and candidate_count; widen series_number range

Revision ID: b2c8e9d01f44
Revises: e8513c93b555
Create Date: 2026-04-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c8e9d01f44"
down_revision: Union[str, Sequence[str], None] = "e8513c93b555"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_script_packing_scripts_per_envelope", "script_packing_series", type_="check")
    op.drop_constraint("ck_script_packing_series_number", "script_packing_series", type_="check")
    op.drop_column("script_packing_series", "scripts_per_envelope")
    op.drop_column("script_packing_series", "candidate_count")
    op.create_check_constraint(
        "ck_script_packing_series_number",
        "script_packing_series",
        "series_number >= 1 AND series_number <= 32767",
    )


def downgrade() -> None:
    op.drop_constraint("ck_script_packing_series_number", "script_packing_series", type_="check")
    op.add_column(
        "script_packing_series",
        sa.Column("scripts_per_envelope", sa.Integer(), nullable=False, server_default="50"),
    )
    op.add_column("script_packing_series", sa.Column("candidate_count", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_script_packing_series_number",
        "script_packing_series",
        "series_number >= 1 AND series_number <= 6",
    )
    op.create_check_constraint(
        "ck_script_packing_scripts_per_envelope",
        "script_packing_series",
        "scripts_per_envelope >= 1",
    )
    op.alter_column("script_packing_series", "scripts_per_envelope", server_default=None)
