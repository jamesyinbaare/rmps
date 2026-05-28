"""First-class examination centres per exam; migrate from school host graph.

Revision ID: e8f9a0b1c2d3
Revises: f7a8b9c0d1e2
Create Date: 2026-05-24

"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "e8f9a0b1c2d3"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        sa.text(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name = :table
            LIMIT 1
            """
        ),
        {"table": table},
    ).first()
    return row is not None


def upgrade() -> None:
    if not _column_exists("examinations", "centre_structure_mode"):
        op.add_column(
            "examinations",
            sa.Column(
                "centre_structure_mode",
                sa.String(length=16),
                nullable=False,
                server_default="UNIFIED",
            ),
        )

    if not _table_exists("examination_centres"):
        op.create_table(
            "examination_centres",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("examination_id", sa.Integer(), sa.ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("code", sa.String(length=32), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("region", sa.String(length=64), nullable=True),
            sa.Column("zone", sa.String(length=8), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.UniqueConstraint("examination_id", "code", name="uq_examination_centres_exam_code"),
        )
        op.create_index("ix_examination_centres_examination_id", "examination_centres", ["examination_id"])

    if not _table_exists("examination_centre_memberships"):
        op.create_table(
            "examination_centre_memberships",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("examination_id", sa.Integer(), sa.ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "examination_centre_id",
                UUID(as_uuid=True),
                sa.ForeignKey("examination_centres.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("school_id", UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_scope", sa.String(length=16), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.UniqueConstraint(
                "examination_centre_id",
                "school_id",
                "subject_scope",
                name="uq_exam_centre_membership_centre_school_scope",
            ),
            sa.UniqueConstraint(
                "examination_id",
                "school_id",
                "subject_scope",
                name="uq_exam_centre_membership_exam_school_scope",
            ),
        )
        op.create_index(
            "ix_examination_centre_memberships_examination_id",
            "examination_centre_memberships",
            ["examination_id"],
        )
        op.create_index(
            "ix_examination_centre_memberships_examination_centre_id",
            "examination_centre_memberships",
            ["examination_centre_id"],
        )
        op.create_index(
            "ix_examination_centre_memberships_school_id",
            "examination_centre_memberships",
            ["school_id"],
        )

    _seed_centres_and_memberships()
    _repoint_operational_tables("exam_centre_officials")
    _repoint_operational_tables("inspector_exam_postings")
    _repoint_operational_tables("inspector_attendance_sheets")
    _repoint_operational_tables("question_paper_control")


def _seed_centres_and_memberships() -> None:
    conn = op.get_bind()
    exams = conn.execute(sa.text("SELECT id FROM examinations ORDER BY id")).fetchall()
    schools = conn.execute(
        sa.text(
            "SELECT id, code, name, region, zone, writes_at_center_id FROM schools ORDER BY code"
        )
    ).fetchall()
    if not schools:
        return

    school_by_id = {row[0]: row for row in schools}

    for (exam_id,) in exams:
        hosts = [s for s in schools if s[5] is None]
        centre_id_by_host_school: dict = {}
        for host in hosts:
            cid = uuid4()
            centre_id_by_host_school[host[0]] = cid
            conn.execute(
                sa.text(
                    """
                    INSERT INTO examination_centres
                        (id, examination_id, code, name, region, zone, created_at, updated_at)
                    VALUES
                        (:id, :exam_id, :code, :name, :region, :zone, now(), now())
                    """
                ),
                {
                    "id": cid,
                    "exam_id": exam_id,
                    "code": host[1],
                    "name": host[2],
                    "region": host[3],
                    "zone": host[4],
                },
            )

        for s in schools:
            global_host_id = s[5] if s[5] is not None else s[0]
            if global_host_id not in centre_id_by_host_school:
                host_row = school_by_id.get(global_host_id)
                if host_row is None:
                    continue
                cid = uuid4()
                centre_id_by_host_school[global_host_id] = cid
                conn.execute(
                    sa.text(
                        """
                        INSERT INTO examination_centres
                            (id, examination_id, code, name, region, zone, created_at, updated_at)
                        VALUES
                            (:id, :exam_id, :code, :name, :region, :zone, now(), now())
                        """
                    ),
                    {
                        "id": cid,
                        "exam_id": exam_id,
                        "code": host_row[1],
                        "name": host_row[2],
                        "region": host_row[3],
                        "zone": host_row[4],
                    },
                )
            centre_id = centre_id_by_host_school[global_host_id]
            mem_id = uuid4()
            conn.execute(
                sa.text(
                    """
                    INSERT INTO examination_centre_memberships
                        (id, examination_id, examination_centre_id, school_id, subject_scope, created_at)
                    VALUES
                        (:id, :exam_id, :centre_id, :school_id, 'ALL', now())
                    """
                ),
                {
                    "id": mem_id,
                    "exam_id": exam_id,
                    "centre_id": centre_id,
                    "school_id": s[0],
                },
            )


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        sa.text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table
              AND column_name = :column
            LIMIT 1
            """
        ),
        {"table": table, "column": column},
    ).first()
    return row is not None


def _drop_fk_on_column(table: str, column: str) -> None:
    """Drop any FK on ``column`` (names differ after table/column renames)."""
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_schema = kcu.constraint_schema
             AND tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = current_schema()
              AND tc.table_name = :table
              AND kcu.column_name = :column
            """
        ),
        {"table": table, "column": column},
    ).fetchall()
    for (name,) in rows:
        op.drop_constraint(name, table, type_="foreignkey")


def _drop_index_if_exists(index_name: str, table: str) -> None:
    conn = op.get_bind()
    exists = conn.execute(
        sa.text(
            """
            SELECT 1 FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = :table
              AND indexname = :index_name
            LIMIT 1
            """
        ),
        {"table": table, "index_name": index_name},
    ).first()
    if exists:
        op.drop_index(index_name, table_name=table)


def _drop_unique_if_exists(name: str, table: str) -> None:
    conn = op.get_bind()
    exists = conn.execute(
        sa.text(
            """
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = current_schema()
              AND table_name = :table
              AND constraint_name = :name
              AND constraint_type = 'UNIQUE'
            LIMIT 1
            """
        ),
        {"table": table, "name": name},
    ).first()
    if exists:
        op.drop_constraint(name, table, type_="unique")


def _repoint_operational_tables(table: str) -> None:
    if not _column_exists(table, "examination_centre_id"):
        op.add_column(
            table,
            sa.Column("examination_centre_id", UUID(as_uuid=True), nullable=True),
        )
    conn = op.get_bind()
    if _column_exists(table, "center_id"):
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} t
                SET examination_centre_id = ec.id
                FROM examination_centres ec
                JOIN schools h ON h.code = ec.code
                WHERE ec.examination_id = t.examination_id
                  AND h.id = t.center_id
                  AND t.examination_centre_id IS NULL
                """
            )
        )
        null_count = conn.execute(
            sa.text(
                f"""
                SELECT COUNT(*) FROM {table}
                WHERE examination_centre_id IS NULL
                  AND center_id IS NOT NULL
                """
            )
        ).scalar()
        if null_count and int(null_count) > 0:
            raise RuntimeError(
                f"{table}: {null_count} rows could not be mapped to examination_centres"
            )

    _drop_index_if_exists(f"ix_{table}_center_id", table)
    if table == "exam_centre_officials":
        _drop_index_if_exists("ix_exam_centre_officials_exam_center", table)
        _drop_index_if_exists("ix_exam_centre_officials_exam_center_scope", table)
        _drop_index_if_exists("ix_exam_school_officials_school_id", table)
    if table == "inspector_exam_postings":
        _drop_unique_if_exists("uq_inspector_postings_exam_center_inspector_scope", table)
    if table == "inspector_attendance_sheets":
        _drop_index_if_exists("ix_inspector_attendance_sheets_exam_center_date", table)
        _drop_index_if_exists("ix_inspector_attendance_sheets_exam_center_date_scope", table)
    if table == "question_paper_control":
        _drop_unique_if_exists("uq_question_paper_control_exam_center_subject_paper_series", table)

    if _column_exists(table, "center_id"):
        _drop_fk_on_column(table, "center_id")
        op.drop_column(table, "center_id")
    if not _fk_exists(table, "examination_centre_id"):
        op.alter_column(table, "examination_centre_id", nullable=False)
        op.create_foreign_key(
            f"{table}_examination_centre_id_fkey",
            table,
            "examination_centres",
            ["examination_centre_id"],
            ["id"],
            ondelete="CASCADE",
        )
    _drop_index_if_exists(f"ix_{table}_examination_centre_id", table)
    op.create_index(f"ix_{table}_examination_centre_id", table, ["examination_centre_id"])

    if table == "exam_centre_officials":
        _drop_index_if_exists("ix_exam_centre_officials_exam_centre", table)
        _drop_index_if_exists("ix_exam_centre_officials_exam_centre_scope", table)
        op.create_index(
            "ix_exam_centre_officials_exam_centre",
            table,
            ["examination_id", "examination_centre_id"],
        )
        op.create_index(
            "ix_exam_centre_officials_exam_centre_scope",
            table,
            ["examination_id", "examination_centre_id", "subject_scope"],
        )
    if table == "inspector_exam_postings":
        _drop_unique_if_exists("uq_inspector_postings_exam_centre_inspector_scope", table)
        op.create_unique_constraint(
            "uq_inspector_postings_exam_centre_inspector_scope",
            table,
            ["examination_id", "examination_centre_id", "inspector_user_id", "subject_scope"],
        )
    if table == "inspector_attendance_sheets":
        _drop_index_if_exists("ix_inspector_attendance_sheets_exam_centre_date", table)
        _drop_index_if_exists("ix_inspector_attendance_sheets_exam_centre_date_scope", table)
        op.create_index(
            "ix_inspector_attendance_sheets_exam_centre_date",
            table,
            ["examination_id", "examination_centre_id", "examination_date"],
        )
        op.create_index(
            "ix_inspector_attendance_sheets_exam_centre_date_scope",
            table,
            ["examination_id", "examination_centre_id", "examination_date", "subject_scope"],
        )
    if table == "question_paper_control":
        _drop_unique_if_exists("uq_question_paper_control_exam_centre_subject_paper_series", table)
        op.create_unique_constraint(
            "uq_question_paper_control_exam_centre_subject_paper_series",
            table,
            [
                "examination_id",
                "examination_centre_id",
                "subject_id",
                "paper_number",
                "series_number",
            ],
        )


def _fk_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_schema = kcu.constraint_schema
             AND tc.constraint_name = kcu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = current_schema()
              AND tc.table_name = :table
              AND kcu.column_name = :column
            LIMIT 1
            """
        ),
        {"table": table, "column": column},
    ).first()
    return row is not None


def downgrade() -> None:
    for table in (
        "question_paper_control",
        "inspector_attendance_sheets",
        "inspector_exam_postings",
        "exam_centre_officials",
    ):
        op.add_column(table, sa.Column("center_id", UUID(as_uuid=True), nullable=True))
        conn = op.get_bind()
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} t
                SET center_id = (
                    SELECT h.id FROM schools h
                    JOIN examination_centres ec ON ec.code = h.code AND ec.id = t.examination_centre_id
                    LIMIT 1
                )
                """
            )
        )
        op.drop_constraint(f"{table}_examination_centre_id_fkey", table, type_="foreignkey")
        op.drop_column(table, "examination_centre_id")
        op.alter_column(table, "center_id", nullable=False)
        op.create_foreign_key(
            f"{table}_center_id_fkey",
            table,
            "schools",
            ["center_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.drop_table("examination_centre_memberships")
    op.drop_table("examination_centres")
    op.drop_column("examinations", "centre_structure_mode")
