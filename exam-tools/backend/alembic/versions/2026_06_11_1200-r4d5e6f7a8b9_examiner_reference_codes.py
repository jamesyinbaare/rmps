"""Add examiner reference codes and per-examination region groups.

Revision ID: r4d5e6f7a8b9
Revises: q3c4d5e6f7a8
Create Date: 2026-06-11
"""

from collections import defaultdict
from collections.abc import Sequence
import re
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "r4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "q3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLE_SHORT_CODES = {
    "chief_examiner": "CE",
    "assistant_chief_examiner": "ACE",
    "assistant_examiner": "AE",
    "team_leader": "TL",
}

DEFAULT_REGION_GROUPS = [
    ("North", "N", ["Northern", "North East", "Savannah", "Upper East", "Upper West"]),
    ("South", "S", ["Greater Accra", "Central", "Western", "Western North", "Volta"]),
    ("East", "E", ["Eastern", "Oti"]),
    ("Middle", "M", ["Ashanti", "Bono", "Bono East", "Ahafo"]),
]

_CODE_SUFFIX_PATTERN = re.compile(r"^(\d+)$")


def upgrade() -> None:
    op.create_table(
        "examination_examiner_region_groups",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("code_prefix", sa.String(length=2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "code_prefix",
            name="uq_examination_examiner_region_groups_exam_prefix",
        ),
    )
    op.create_index(
        "ix_examination_examiner_region_groups_examination_id",
        "examination_examiner_region_groups",
        ["examination_id"],
    )

    op.create_table(
        "examination_examiner_region_group_regions",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("group_id", UUID(as_uuid=True), nullable=False),
        sa.Column("region", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["examination_examiner_region_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "examination_id",
            "region",
            name="uq_examination_examiner_region_group_regions_exam_region",
        ),
    )
    op.create_index(
        "ix_examination_examiner_region_group_regions_examination_id",
        "examination_examiner_region_group_regions",
        ["examination_id"],
    )
    op.create_index(
        "ix_examination_examiner_region_group_regions_group_id",
        "examination_examiner_region_group_regions",
        ["group_id"],
    )

    op.add_column("examiners", sa.Column("reference_code", sa.String(length=16), nullable=True))
    op.create_unique_constraint(
        "uq_examiners_examination_reference_code",
        "examiners",
        ["examination_id", "reference_code"],
    )

    conn = op.get_bind()
    exam_ids = [
        int(row[0])
        for row in conn.execute(sa.text("SELECT DISTINCT examination_id FROM examiners ORDER BY examination_id"))
    ]

    for exam_id in exam_ids:
        existing_groups = conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM examination_examiner_region_groups WHERE examination_id = :exam_id"
            ),
            {"exam_id": exam_id},
        ).scalar_one()
        if int(existing_groups or 0) == 0:
            for name, prefix, regions in DEFAULT_REGION_GROUPS:
                group_id = uuid.uuid4()
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO examination_examiner_region_groups
                            (id, examination_id, name, code_prefix, created_at, updated_at)
                        VALUES (:id, :exam_id, :name, :prefix, now(), now())
                        """
                    ),
                    {"id": group_id, "exam_id": exam_id, "name": name, "prefix": prefix},
                )
                for region in regions:
                    conn.execute(
                        sa.text(
                            """
                            INSERT INTO examination_examiner_region_group_regions
                                (id, examination_id, group_id, region, created_at, updated_at)
                            VALUES (:id, :exam_id, :group_id, :region, now(), now())
                            """
                        ),
                        {
                            "id": uuid.uuid4(),
                            "exam_id": exam_id,
                            "group_id": group_id,
                            "region": region,
                        },
                    )

        prefix_by_region: dict[str, str] = {}
        for row in conn.execute(
            sa.text(
                """
                SELECT r.region, g.code_prefix
                FROM examination_examiner_region_group_regions r
                JOIN examination_examiner_region_groups g ON g.id = r.group_id
                WHERE r.examination_id = :exam_id
                """
            ),
            {"exam_id": exam_id},
        ):
            prefix_by_region[str(row[0])] = str(row[1]).upper()

        examiners = conn.execute(
            sa.text(
                """
                SELECT id, region, examiner_type, reference_code
                FROM examiners
                WHERE examination_id = :exam_id
                ORDER BY created_at, id
                """
            ),
            {"exam_id": exam_id},
        ).fetchall()

        max_seq_by_prefix_role: dict[str, int] = defaultdict(int)
        for row in examiners:
            ref = row[3]
            if not ref:
                continue
            for prefix_role in {f"{p}{rc}" for p in prefix_by_region.values() for rc in ROLE_SHORT_CODES.values()}:
                if ref.startswith(prefix_role):
                    suffix = ref[len(prefix_role) :]
                    match = _CODE_SUFFIX_PATTERN.fullmatch(suffix)
                    if match:
                        max_seq_by_prefix_role[prefix_role] = max(
                            max_seq_by_prefix_role[prefix_role],
                            int(match.group(1)),
                        )

        for row in examiners:
            examiner_id, region, examiner_type, ref = row[0], row[1], row[2], row[3]
            if ref:
                continue
            prefix = prefix_by_region.get(str(region))
            role_code = ROLE_SHORT_CODES.get(str(examiner_type))
            if not prefix or not role_code:
                continue
            prefix_role = f"{prefix}{role_code}"
            max_seq_by_prefix_role[prefix_role] += 1
            code = f"{prefix_role}{max_seq_by_prefix_role[prefix_role]}"
            conn.execute(
                sa.text(
                    "UPDATE examiners SET reference_code = :code WHERE id = :id"
                ),
                {"code": code, "id": examiner_id},
            )


def downgrade() -> None:
    op.drop_constraint("uq_examiners_examination_reference_code", "examiners", type_="unique")
    op.drop_column("examiners", "reference_code")

    op.drop_index(
        "ix_examination_examiner_region_group_regions_group_id",
        table_name="examination_examiner_region_group_regions",
    )
    op.drop_index(
        "ix_examination_examiner_region_group_regions_examination_id",
        table_name="examination_examiner_region_group_regions",
    )
    op.drop_table("examination_examiner_region_group_regions")

    op.drop_index(
        "ix_examination_examiner_region_groups_examination_id",
        table_name="examination_examiner_region_groups",
    )
    op.drop_table("examination_examiner_region_groups")
