"""Add T&T zones, region assignments, and role×zone factors.

Revision ID: q3c4d5e6f7a8
Revises: p2b3c4d5e6f9
Create Date: 2026-06-15
"""

from collections.abc import Sequence
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "q3c4d5e6f7a8"
down_revision: str | Sequence[str] | None = "p2b3c4d5e6f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REGION_VALUES = [
    "Ashanti",
    "Bono",
    "Bono East",
    "Ahafo",
    "Central",
    "Eastern",
    "Greater Accra",
    "Northern",
    "North East",
    "Savannah",
    "Upper East",
    "Upper West",
    "Volta",
    "Oti",
    "Western",
    "Western North",
]


def upgrade() -> None:
    op.create_table(
        "examination_examiner_travel_zones",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "name",
            name="uq_examination_examiner_travel_zones_exam_name",
        ),
    )
    op.create_index(
        "ix_examination_examiner_travel_zones_examination_id",
        "examination_examiner_travel_zones",
        ["examination_id"],
    )

    op.create_table(
        "examination_examiner_travel_zone_regions",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("zone_id", UUID(as_uuid=True), nullable=False),
        sa.Column("region", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["zone_id"], ["examination_examiner_travel_zones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "region",
            name="uq_examination_examiner_travel_zone_regions_exam_region",
        ),
    )
    op.create_index(
        "ix_examination_examiner_travel_zone_regions_examination_id",
        "examination_examiner_travel_zone_regions",
        ["examination_id"],
    )
    op.create_index(
        "ix_examination_examiner_travel_zone_regions_zone_id",
        "examination_examiner_travel_zone_regions",
        ["zone_id"],
    )

    op.add_column(
        "examination_examiner_travel_role_factors",
        sa.Column("zone_id", UUID(as_uuid=True), nullable=True),
    )

    conn = op.get_bind()
    exams_with_factors = conn.execute(
        sa.text(
            "SELECT DISTINCT examination_id FROM examination_examiner_travel_role_factors"
        )
    ).fetchall()

    for (exam_id,) in exams_with_factors:
        zone_id = uuid.uuid4()
        conn.execute(
            sa.text(
                """
                INSERT INTO examination_examiner_travel_zones
                    (id, examination_id, name, sort_order, created_at, updated_at)
                VALUES (:id, :exam_id, 'Default', 0, now(), now())
                """
            ),
            {"id": zone_id, "exam_id": exam_id},
        )
        for region in REGION_VALUES:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO examination_examiner_travel_zone_regions
                        (id, examination_id, zone_id, region, created_at, updated_at)
                    VALUES (:id, :exam_id, :zone_id, :region, now(), now())
                    """
                ),
                {"id": uuid.uuid4(), "exam_id": exam_id, "zone_id": zone_id, "region": region},
            )
        conn.execute(
            sa.text(
                """
                UPDATE examination_examiner_travel_role_factors
                SET zone_id = :zone_id
                WHERE examination_id = :exam_id
                """
            ),
            {"zone_id": zone_id, "exam_id": exam_id},
        )

    op.drop_constraint(
        "uq_examination_examiner_travel_role_factors_exam_role",
        "examination_examiner_travel_role_factors",
        type_="unique",
    )
    op.alter_column(
        "examination_examiner_travel_role_factors",
        "zone_id",
        existing_type=UUID(as_uuid=True),
        nullable=False,
    )
    op.create_foreign_key(
        "fk_examination_examiner_travel_role_factors_zone_id",
        "examination_examiner_travel_role_factors",
        "examination_examiner_travel_zones",
        ["zone_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_examination_examiner_travel_role_factors_zone_id",
        "examination_examiner_travel_role_factors",
        ["zone_id"],
    )
    op.create_unique_constraint(
        "uq_examination_examiner_travel_role_factors_exam_role_zone",
        "examination_examiner_travel_role_factors",
        ["examination_id", "examiner_type", "zone_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_examination_examiner_travel_role_factors_exam_role_zone",
        "examination_examiner_travel_role_factors",
        type_="unique",
    )
    op.drop_index(
        "ix_examination_examiner_travel_role_factors_zone_id",
        table_name="examination_examiner_travel_role_factors",
    )
    op.drop_constraint(
        "fk_examination_examiner_travel_role_factors_zone_id",
        "examination_examiner_travel_role_factors",
        type_="foreignkey",
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            DELETE FROM examination_examiner_travel_role_factors f1
            USING examination_examiner_travel_role_factors f2
            WHERE f1.examination_id = f2.examination_id
              AND f1.examiner_type = f2.examiner_type
              AND f1.id > f2.id
            """
        )
    )

    op.drop_column("examination_examiner_travel_role_factors", "zone_id")
    op.create_unique_constraint(
        "uq_examination_examiner_travel_role_factors_exam_role",
        "examination_examiner_travel_role_factors",
        ["examination_id", "examiner_type"],
    )

    op.drop_index(
        "ix_examination_examiner_travel_zone_regions_zone_id",
        table_name="examination_examiner_travel_zone_regions",
    )
    op.drop_index(
        "ix_examination_examiner_travel_zone_regions_examination_id",
        table_name="examination_examiner_travel_zone_regions",
    )
    op.drop_table("examination_examiner_travel_zone_regions")
    op.drop_index(
        "ix_examination_examiner_travel_zones_examination_id",
        table_name="examination_examiner_travel_zones",
    )
    op.drop_table("examination_examiner_travel_zones")
