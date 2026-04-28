"""Add irregular script packing/envelope models.

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-04-28 21:15:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "irregular_script_packing_series",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("school_id", sa.UUID(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("paper_number", sa.SmallInteger(), nullable=False),
        sa.Column("series_number", sa.SmallInteger(), nullable=False),
        sa.Column("updated_by_id", sa.UUID(), nullable=True),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("verified_by_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("paper_number >= 1", name="ck_irregular_script_packing_paper_number"),
        sa.CheckConstraint(
            "series_number >= 1 AND series_number <= 32767",
            name="ck_irregular_script_packing_series_number",
        ),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verified_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "school_id",
            "subject_id",
            "paper_number",
            "series_number",
            name="uq_irreg_pack_series_exam_school_sub_paper_ser",
        ),
    )
    op.create_index(
        op.f("ix_irregular_script_packing_series_examination_id"),
        "irregular_script_packing_series",
        ["examination_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_script_packing_series_school_id"),
        "irregular_script_packing_series",
        ["school_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_script_packing_series_subject_id"),
        "irregular_script_packing_series",
        ["subject_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_script_packing_series_updated_by_id"),
        "irregular_script_packing_series",
        ["updated_by_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_script_packing_series_verified_by_id"),
        "irregular_script_packing_series",
        ["verified_by_id"],
        unique=False,
    )

    op.create_table(
        "irregular_script_envelopes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("packing_series_id", sa.UUID(), nullable=False),
        sa.Column("envelope_number", sa.Integer(), nullable=False),
        sa.Column("booklet_count", sa.Integer(), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("verified_by_id", sa.UUID(), nullable=True),
        sa.CheckConstraint("booklet_count >= 0", name="ck_irregular_script_envelope_booklet_count"),
        sa.CheckConstraint("envelope_number >= 1", name="ck_irregular_script_envelope_number"),
        sa.ForeignKeyConstraint(["packing_series_id"], ["irregular_script_packing_series.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("packing_series_id", "envelope_number", name="uq_irregular_script_envelope_series_number"),
    )
    op.create_index(
        op.f("ix_irregular_script_envelopes_packing_series_id"),
        "irregular_script_envelopes",
        ["packing_series_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_irregular_script_envelopes_verified_by_id"),
        "irregular_script_envelopes",
        ["verified_by_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_irregular_script_envelopes_verified_by_id"), table_name="irregular_script_envelopes")
    op.drop_index(op.f("ix_irregular_script_envelopes_packing_series_id"), table_name="irregular_script_envelopes")
    op.drop_table("irregular_script_envelopes")

    op.drop_index(
        op.f("ix_irregular_script_packing_series_verified_by_id"),
        table_name="irregular_script_packing_series",
    )
    op.drop_index(
        op.f("ix_irregular_script_packing_series_updated_by_id"),
        table_name="irregular_script_packing_series",
    )
    op.drop_index(op.f("ix_irregular_script_packing_series_subject_id"), table_name="irregular_script_packing_series")
    op.drop_index(op.f("ix_irregular_script_packing_series_school_id"), table_name="irregular_script_packing_series")
    op.drop_index(
        op.f("ix_irregular_script_packing_series_examination_id"),
        table_name="irregular_script_packing_series",
    )
    op.drop_table("irregular_script_packing_series")
