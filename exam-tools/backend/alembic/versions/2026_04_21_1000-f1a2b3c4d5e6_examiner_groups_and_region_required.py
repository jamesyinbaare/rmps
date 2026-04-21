"""Examiner groups, required examiner region, drop examiner zone and allowed_zones.

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-04-21 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

REGION_ENUM = postgresql.ENUM(
    "ASHANTI",
    "BONO",
    "BONO_EAST",
    "AHAFO",
    "CENTRAL",
    "EASTERN",
    "GREATER_ACCRA",
    "NORTHERN",
    "NORTH_EAST",
    "SAVANNAH",
    "UPPER_EAST",
    "UPPER_WEST",
    "VOLTA",
    "OTI",
    "WESTERN",
    "WESTERN_NORTH",
    name="region",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "examiner_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_examiner_groups_examination_id"), "examiner_groups", ["examination_id"], unique=False)

    op.create_table(
        "examiner_group_members",
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("examiner_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["examiner_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "examiner_id"),
        sa.UniqueConstraint("examiner_id", name="uq_examiner_group_member_examiner"),
    )

    op.create_table(
        "examiner_group_source_regions",
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("region", REGION_ENUM, nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["examiner_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "region"),
        sa.UniqueConstraint(
            "examination_id",
            "region",
            name="uq_examiner_group_source_region_per_exam",
        ),
    )
    op.create_index(
        op.f("ix_examiner_group_source_regions_examination_id"),
        "examiner_group_source_regions",
        ["examination_id"],
        unique=False,
    )

    # Backfill examiner.region from schools when missing (one region per zone via min)
    op.execute(
        """
        UPDATE examiners e
        SET region = sub.region
        FROM (
            SELECT DISTINCT ON (zone) zone, region
            FROM schools
            ORDER BY zone, region
        ) AS sub
        WHERE e.region IS NULL AND e.zone IS NOT NULL AND e.zone = sub.zone
        """
    )
    op.execute(
        """
        UPDATE examiners
        SET region = 'GREATER_ACCRA'
        WHERE region IS NULL
        """
    )

    op.drop_table("examiner_allowed_zones")

    op.drop_column("examiners", "zone")

    op.alter_column(
        "examiners",
        "region",
        existing_type=REGION_ENUM,
        nullable=False,
    )

    op.execute("UPDATE allocation_campaigns SET cross_marking_rules = '{}'::jsonb")


def downgrade() -> None:
    op.add_column(
        "examiners",
        sa.Column(
            "zone",
            postgresql.ENUM(
                "A",
                "B",
                "C",
                "D",
                "E",
                "F",
                "G",
                "H",
                "I",
                "J",
                "K",
                "L",
                "M",
                "N",
                "O",
                "P",
                "Q",
                "R",
                "S",
                "T",
                "U",
                "V",
                "W",
                "X",
                "Y",
                "Z",
                name="zone",
                create_type=False,
            ),
            nullable=True,
        ),
    )

    op.alter_column(
        "examiners",
        "region",
        existing_type=REGION_ENUM,
        nullable=True,
    )

    op.create_table(
        "examiner_allowed_zones",
        sa.Column("examiner_id", sa.UUID(), nullable=False),
        sa.Column(
            "zone",
            postgresql.ENUM(
                "A",
                "B",
                "C",
                "D",
                "E",
                "F",
                "G",
                "H",
                "I",
                "J",
                "K",
                "L",
                "M",
                "N",
                "O",
                "P",
                "Q",
                "R",
                "S",
                "T",
                "U",
                "V",
                "W",
                "X",
                "Y",
                "Z",
                name="zone",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examiner_id", "zone"),
    )

    op.drop_index(op.f("ix_examiner_group_source_regions_examination_id"), table_name="examiner_group_source_regions")
    op.drop_table("examiner_group_source_regions")
    op.drop_table("examiner_group_members")
    op.drop_index(op.f("ix_examiner_groups_examination_id"), table_name="examiner_groups")
    op.drop_table("examiner_groups")
