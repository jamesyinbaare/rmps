"""Add programme types, exam series catalog, and exam enablement

Revision ID: a8b9c0d1e2f3
Revises: f7g8h9i0j1k2
Create Date: 2026-03-18 22:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f7g8h9i0j1k2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "programme_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("programme_types.id", ondelete="CASCADE"), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_programme_types_code", "programme_types", ["code"], unique=True)
    op.create_index("ix_programme_types_parent_id", "programme_types", ["parent_id"])
    op.create_index("ix_programme_types_is_active", "programme_types", ["is_active"])

    op.create_table(
        "exam_series",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("short_name", sa.String(length=50), nullable=False),
        sa.Column("long_name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_exam_series_short_name", "exam_series", ["short_name"], unique=True)
    op.create_index("ix_exam_series_is_active", "exam_series", ["is_active"])

    op.bulk_insert(
        sa.table(
            "exam_series",
            sa.column("id", sa.Integer),
            sa.column("short_name", sa.String),
            sa.column("long_name", sa.String),
            sa.column("sort_order", sa.Integer),
            sa.column("is_active", sa.Boolean),
        ),
        [
            {"id": 1, "short_name": "MAY/JUNE", "long_name": "May/June Examinations", "sort_order": 1, "is_active": True},
            {"id": 2, "short_name": "NOV/DEC", "long_name": "November/December Examinations", "sort_order": 2, "is_active": True},
            {"id": 3, "short_name": "MAIN", "long_name": "Main Sitting", "sort_order": 3, "is_active": True},
        ],
    )

    op.bulk_insert(
        sa.table(
            "programme_types",
            sa.column("id", sa.Integer),
            sa.column("code", sa.String),
            sa.column("name", sa.String),
            sa.column("parent_id", sa.Integer),
            sa.column("sort_order", sa.Integer),
            sa.column("is_active", sa.Boolean),
        ),
        [
            {"id": 1, "code": "CERT_II", "name": "Certificate II", "parent_id": None, "sort_order": 1, "is_active": True},
            {"id": 2, "code": "TRADITIONAL", "name": "Traditional", "parent_id": None, "sort_order": 2, "is_active": True},
            {"id": 3, "code": "ADVANCE", "name": "Advance", "parent_id": 2, "sort_order": 1, "is_active": True},
            {"id": 4, "code": "TECHNICIANS", "name": "Technicians", "parent_id": 2, "sort_order": 2, "is_active": True},
            {"id": 5, "code": "TECH_PART_I", "name": "Technicians Part I", "parent_id": 4, "sort_order": 1, "is_active": True},
            {"id": 6, "code": "TECH_PART_II", "name": "Technicians Part II", "parent_id": 4, "sort_order": 2, "is_active": True},
            {"id": 7, "code": "TECH_PART_III", "name": "Technicians Part III", "parent_id": 4, "sort_order": 3, "is_active": True},
            {"id": 8, "code": "DBS", "name": "Diploma in Business Studies (DBS)", "parent_id": 2, "sort_order": 3, "is_active": True},
            {"id": 9, "code": "DIPLOMA", "name": "Diploma", "parent_id": 2, "sort_order": 4, "is_active": True},
        ],
    )

    op.execute("SELECT setval(pg_get_serial_sequence('exam_series', 'id'), (SELECT MAX(id) FROM exam_series))")
    op.execute(
        "SELECT setval(pg_get_serial_sequence('programme_types', 'id'), (SELECT MAX(id) FROM programme_types))"
    )

    op.add_column("programmes", sa.Column("programme_type_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_programmes_programme_type_id",
        "programmes",
        "programme_types",
        ["programme_type_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_programmes_programme_type_id", "programmes", ["programme_type_id"])
    op.execute("UPDATE programmes SET programme_type_id = 1 WHERE programme_type_id IS NULL")

    op.add_column("registration_exams", sa.Column("programme_type_id", sa.Integer(), nullable=True))
    op.add_column("registration_exams", sa.Column("exam_series_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_registration_exams_programme_type_id",
        "registration_exams",
        "programme_types",
        ["programme_type_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_registration_exams_exam_series_id",
        "registration_exams",
        "exam_series",
        ["exam_series_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_registration_exams_programme_type_id", "registration_exams", ["programme_type_id"])
    op.create_index("ix_registration_exams_exam_series_id", "registration_exams", ["exam_series_id"])
    op.alter_column(
        "registration_exams",
        "exam_series",
        existing_type=sa.String(length=20),
        type_=sa.String(length=50),
        existing_nullable=True,
    )

    op.create_table(
        "exam_enabled_programme_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "programme_type_id",
            sa.Integer(),
            sa.ForeignKey("programme_types.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("exam_id", "programme_type_id", name="uq_exam_enabled_programme_type"),
    )
    op.create_index("ix_exam_enabled_programme_types_exam_id", "exam_enabled_programme_types", ["exam_id"])
    op.create_index(
        "ix_exam_enabled_programme_types_programme_type_id",
        "exam_enabled_programme_types",
        ["programme_type_id"],
    )

    conn = op.get_bind()
    exams = conn.execute(
        sa.text("SELECT id, exam_type, exam_series, year FROM registration_exams")
    ).fetchall()

    type_map = {
        "certificate ii examinations": (1, [1]),
        "certificate ii examination": (1, [1]),
        "advance": (2, [3]),
        "technician part i": (2, [5]),
        "technician part 1": (2, [5]),
        "technicians part i": (2, [5]),
        "technician part ii": (2, [6]),
        "technician part 2": (2, [6]),
        "technicians part ii": (2, [6]),
        "technician part iii": (2, [7]),
        "technician part 3": (2, [7]),
        "technicians part iii": (2, [7]),
        "diploma": (2, [9]),
        "dbs": (2, [8]),
        "diploma in business studies": (2, [8]),
        "diploma in business studies (dbs)": (2, [8]),
        "traditional": (2, [3, 5, 6, 7, 8, 9]),
    }
    series_map = {
        "may/june": 1,
        "may-june": 1,
        "may june": 1,
        "nov/dec": 2,
        "nov-dec": 2,
        "nov dec": 2,
        "main": 3,
    }
    series_short = {1: "MAY/JUNE", 2: "NOV/DEC", 3: "MAIN"}

    for exam_id, exam_type, exam_series, _year in exams:
        key = (exam_type or "").strip().lower()
        root_id, enabled_ids = type_map.get(key, (1, [1]))
        series_key = (exam_series or "").strip().lower()
        series_id = series_map.get(series_key, 3)
        if root_id == 1:
            display_type = "Certificate II"
        else:
            display_type = "Traditional"

        conn.execute(
            sa.text(
                """
                UPDATE registration_exams
                SET programme_type_id = :ptid,
                    exam_series_id = :sid,
                    exam_type = :etype,
                    exam_series = :eseries
                WHERE id = :id
                """
            ),
            {
                "ptid": root_id,
                "sid": series_id,
                "etype": display_type,
                "eseries": series_short[series_id],
                "id": exam_id,
            },
        )
        for pt_id in enabled_ids:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO exam_enabled_programme_types (exam_id, programme_type_id, created_at)
                    VALUES (:exam_id, :pt_id, CURRENT_TIMESTAMP)
                    ON CONFLICT (exam_id, programme_type_id) DO NOTHING
                    """
                ),
                {"exam_id": exam_id, "pt_id": pt_id},
            )

    op.create_unique_constraint(
        "uq_exam_programme_type_series_year",
        "registration_exams",
        ["programme_type_id", "exam_series_id", "year"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_exam_programme_type_series_year", "registration_exams", type_="unique")
    op.drop_table("exam_enabled_programme_types")
    op.drop_constraint("fk_registration_exams_exam_series_id", "registration_exams", type_="foreignkey")
    op.drop_constraint("fk_registration_exams_programme_type_id", "registration_exams", type_="foreignkey")
    op.drop_index("ix_registration_exams_exam_series_id", table_name="registration_exams")
    op.drop_index("ix_registration_exams_programme_type_id", table_name="registration_exams")
    op.drop_column("registration_exams", "exam_series_id")
    op.drop_column("registration_exams", "programme_type_id")
    op.alter_column(
        "registration_exams",
        "exam_series",
        existing_type=sa.String(length=50),
        type_=sa.String(length=20),
        existing_nullable=True,
    )
    op.drop_constraint("fk_programmes_programme_type_id", "programmes", type_="foreignkey")
    op.drop_index("ix_programmes_programme_type_id", table_name="programmes")
    op.drop_column("programmes", "programme_type_id")
    op.drop_index("ix_exam_series_is_active", table_name="exam_series")
    op.drop_index("ix_exam_series_short_name", table_name="exam_series")
    op.drop_table("exam_series")
    op.drop_index("ix_programme_types_is_active", table_name="programme_types")
    op.drop_index("ix_programme_types_parent_id", table_name="programme_types")
    op.drop_index("ix_programme_types_code", table_name="programme_types")
    op.drop_table("programme_types")
