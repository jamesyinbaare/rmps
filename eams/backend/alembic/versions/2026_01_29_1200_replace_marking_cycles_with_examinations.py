"""Replace marking_cycles with examinations and subject_examiners

Revision ID: a1b2c3d4e5f6
Revises: 11c4f5c70cb8
Create Date: 2026-01-29 12:00:00

Migrates from marking_cycles + cycle_id to examinations + subject_examiners + subject_examiner_id.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "11c4f5c70cb8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enum_exists(conn, name: str) -> bool:
    result = conn.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = :n"), {"n": name})
    return result.scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Create ExamType and ExamSeries enums if not exist
    if not _enum_exists(conn, "examtype"):
        op.execute(
            "CREATE TYPE examtype AS ENUM ("
            "'CERTIFICATE_II', 'ADVANCE', 'TECHNICIAN_PART_I', 'TECHNICIAN_PART_II', "
            "'TECHNICIAN_PART_III', 'DIPLOMA')"
        )
    if not _enum_exists(conn, "examseries"):
        op.execute("CREATE TYPE examseries AS ENUM ('MAY_JUNE', 'NOV_DEC')")

    # 2. Create examinations table
    op.create_table(
        "examinations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "type",
            postgresql.ENUM(
                "CERTIFICATE_II",
                "ADVANCE",
                "TECHNICIAN_PART_I",
                "TECHNICIAN_PART_II",
                "TECHNICIAN_PART_III",
                "DIPLOMA",
                name="examtype",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "series",
            postgresql.ENUM("MAY_JUNE", "NOV_DEC", name="examseries", create_type=False),
            nullable=True,
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("acceptance_deadline", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_examinations_id"), "examinations", ["id"], unique=False)
    op.create_index(op.f("ix_examinations_type"), "examinations", ["type"], unique=False)
    op.create_index(op.f("ix_examinations_series"), "examinations", ["series"], unique=False)
    op.create_index(op.f("ix_examinations_year"), "examinations", ["year"], unique=False)

    # 3. Create subject_examiners table (with temporary old_cycle_id for mapping)
    op.create_table(
        "subject_examiners",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.UUID(), nullable=False),
        sa.Column("subject_id", sa.UUID(), nullable=False),
        sa.Column("total_required", sa.Integer(), nullable=False),
        sa.Column("experience_ratio", sa.Float(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("DRAFT", "OPEN", "ALLOCATED", "CLOSED", name="markingcyclestatus", create_type=False),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("examination_id", "subject_id", name="uq_subject_examiner_examination_subject"),
    )
    op.create_index(op.f("ix_subject_examiners_id"), "subject_examiners", ["id"], unique=False)
    op.create_index(op.f("ix_subject_examiners_examination_id"), "subject_examiners", ["examination_id"], unique=False)
    op.create_index(op.f("ix_subject_examiners_subject_id"), "subject_examiners", ["subject_id"], unique=False)
    op.create_index(op.f("ix_subject_examiners_status"), "subject_examiners", ["status"], unique=False)

    # 4. Migrate data: one examination per distinct year (default type CERTIFICATE_II, series NULL)
    op.execute("""
        INSERT INTO examinations (id, type, series, year, acceptance_deadline, created_at, updated_at)
        SELECT gen_random_uuid(), 'CERTIFICATE_II'::examtype, NULL, year, MAX(acceptance_deadline), MIN(created_at), MAX(updated_at)
        FROM marking_cycles
        GROUP BY year
    """)

    # 5. Migrate marking_cycles -> subject_examiners (one row per cycle)
    op.execute("""
        INSERT INTO subject_examiners (id, examination_id, subject_id, total_required, experience_ratio, status, created_at, updated_at)
        SELECT mc.id, e.id, mc.subject_id, mc.total_required, mc.experience_ratio, mc.status, mc.created_at, mc.updated_at
        FROM marking_cycles mc
        JOIN examinations e ON e.year = mc.year
    """)

    # 6. Add subject_examiner_id to child tables and backfill (cycle_id = subject_examiners.id now)
    op.add_column(
        "examiner_allocations",
        sa.Column("subject_examiner_id", sa.UUID(), nullable=True),
    )
    op.execute("UPDATE examiner_allocations ea SET subject_examiner_id = ea.cycle_id")
    op.drop_constraint("uq_examiner_allocation", "examiner_allocations", type_="unique")
    op.drop_constraint("examiner_allocations_cycle_id_fkey", "examiner_allocations", type_="foreignkey")
    op.drop_index(op.f("ix_examiner_allocations_cycle_id"), table_name="examiner_allocations")
    op.drop_column("examiner_allocations", "cycle_id")
    op.create_foreign_key(
        "examiner_allocations_subject_examiner_id_fkey",
        "examiner_allocations",
        "subject_examiners",
        ["subject_examiner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_examiner_allocations_subject_examiner_id"), "examiner_allocations", ["subject_examiner_id"], unique=False)
    op.alter_column("examiner_allocations", "subject_examiner_id", nullable=False)
    op.create_unique_constraint("uq_examiner_allocation", "examiner_allocations", ["examiner_id", "subject_examiner_id", "subject_id"])

    op.add_column(
        "subject_quotas",
        sa.Column("subject_examiner_id", sa.UUID(), nullable=True),
    )
    op.execute("UPDATE subject_quotas sq SET subject_examiner_id = sq.cycle_id")
    op.drop_constraint("uq_subject_quota", "subject_quotas", type_="unique")
    op.drop_constraint("subject_quotas_cycle_id_fkey", "subject_quotas", type_="foreignkey")
    op.drop_index(op.f("ix_subject_quotas_cycle_id"), table_name="subject_quotas")
    op.drop_column("subject_quotas", "cycle_id")
    op.create_foreign_key(
        "subject_quotas_subject_examiner_id_fkey",
        "subject_quotas",
        "subject_examiners",
        ["subject_examiner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_subject_quotas_subject_examiner_id"), "subject_quotas", ["subject_examiner_id"], unique=False)
    op.alter_column("subject_quotas", "subject_examiner_id", nullable=False)
    op.create_unique_constraint("uq_subject_quota", "subject_quotas", ["subject_examiner_id", "subject_id", "quota_type", "quota_key"])

    op.add_column(
        "allocation_audit_logs",
        sa.Column("subject_examiner_id", sa.UUID(), nullable=True),
    )
    op.execute("UPDATE allocation_audit_logs aal SET subject_examiner_id = aal.cycle_id")
    op.drop_constraint("allocation_audit_logs_cycle_id_fkey", "allocation_audit_logs", type_="foreignkey")
    op.drop_index(op.f("ix_allocation_audit_logs_cycle_id"), table_name="allocation_audit_logs")
    op.drop_column("allocation_audit_logs", "cycle_id")
    op.create_foreign_key(
        "allocation_audit_logs_subject_examiner_id_fkey",
        "allocation_audit_logs",
        "subject_examiners",
        ["subject_examiner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_allocation_audit_logs_subject_examiner_id"), "allocation_audit_logs", ["subject_examiner_id"], unique=False)

    op.add_column(
        "examiner_acceptances",
        sa.Column("subject_examiner_id", sa.UUID(), nullable=True),
    )
    op.execute("UPDATE examiner_acceptances ea SET subject_examiner_id = ea.cycle_id")
    op.drop_constraint("uq_examiner_acceptance", "examiner_acceptances", type_="unique")
    op.drop_constraint("examiner_acceptances_cycle_id_fkey", "examiner_acceptances", type_="foreignkey")
    op.drop_index(op.f("ix_examiner_acceptances_cycle_id"), table_name="examiner_acceptances")
    op.drop_column("examiner_acceptances", "cycle_id")
    op.create_foreign_key(
        "examiner_acceptances_subject_examiner_id_fkey",
        "examiner_acceptances",
        "subject_examiners",
        ["subject_examiner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_examiner_acceptances_subject_examiner_id"), "examiner_acceptances", ["subject_examiner_id"], unique=False)
    op.alter_column("examiner_acceptances", "subject_examiner_id", nullable=False)
    op.create_unique_constraint("uq_examiner_acceptance", "examiner_acceptances", ["examiner_id", "subject_examiner_id", "subject_id"])

    # 7. Drop marking_cycles
    op.drop_index(op.f("ix_marking_cycles_year"), table_name="marking_cycles")
    op.drop_index(op.f("ix_marking_cycles_subject_id"), table_name="marking_cycles")
    op.drop_index(op.f("ix_marking_cycles_status"), table_name="marking_cycles")
    op.drop_index(op.f("ix_marking_cycles_id"), table_name="marking_cycles")
    op.drop_table("marking_cycles")


def downgrade() -> None:
    # Recreate marking_cycles and revert columns (lossy: examinations type/series not stored in cycles)
    op.create_table(
        "marking_cycles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.UUID(), nullable=False),
        sa.Column("total_required", sa.Integer(), nullable=False),
        sa.Column("experience_ratio", sa.Float(), nullable=False),
        sa.Column("acceptance_deadline", sa.DateTime(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("DRAFT", "OPEN", "ALLOCATED", "CLOSED", name="markingcyclestatus", create_type=False),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("year", "subject_id", name="uq_marking_cycle_year_subject"),
    )
    op.create_index(op.f("ix_marking_cycles_id"), "marking_cycles", ["id"], unique=False)
    op.create_index(op.f("ix_marking_cycles_status"), "marking_cycles", ["status"], unique=False)
    op.create_index(op.f("ix_marking_cycles_subject_id"), "marking_cycles", ["subject_id"], unique=False)
    op.create_index(op.f("ix_marking_cycles_year"), "marking_cycles", ["year"], unique=False)

    op.execute("""
        INSERT INTO marking_cycles (id, year, subject_id, total_required, experience_ratio, acceptance_deadline, status, created_at, updated_at)
        SELECT id, (SELECT year FROM examinations e WHERE e.id = subject_examiners.examination_id), subject_id, total_required, experience_ratio,
               (SELECT acceptance_deadline FROM examinations e WHERE e.id = subject_examiners.examination_id), status, created_at, updated_at
        FROM subject_examiners
    """)

    for table, uq_name, fk_col in [
        ("examiner_allocations", "uq_examiner_allocation", "subject_examiner_id"),
        ("subject_quotas", "uq_subject_quota", "subject_examiner_id"),
        ("allocation_audit_logs", None, "subject_examiner_id"),
        ("examiner_acceptances", "uq_examiner_acceptance", "subject_examiner_id"),
    ]:
        if uq_name:
            op.drop_constraint(uq_name, table, type_="unique")
        op.add_column(table, sa.Column("cycle_id", sa.UUID(), nullable=True))
        op.execute(f"UPDATE {table} SET cycle_id = {fk_col}")
        op.drop_constraint(f"{table}_{fk_col}_fkey", table, type_="foreignkey")
        op.drop_index(op.f(f"ix_{table}_{fk_col}"), table_name=table)
        op.drop_column(table, fk_col)
        op.create_foreign_key(f"{table}_cycle_id_fkey", table, "marking_cycles", ["cycle_id"], ["id"], ondelete="CASCADE")
        op.create_index(op.f(f"ix_{table}_cycle_id"), table, ["cycle_id"], unique=False)
        if table == "examiner_allocations":
            op.alter_column(table, "cycle_id", nullable=False)
            op.create_unique_constraint(uq_name, table, ["examiner_id", "cycle_id", "subject_id"])
        elif table == "subject_quotas":
            op.alter_column(table, "cycle_id", nullable=False)
            op.create_unique_constraint(uq_name, table, ["cycle_id", "subject_id", "quota_type", "quota_key"])
        elif table == "examiner_acceptances":
            op.alter_column(table, "cycle_id", nullable=False)
            op.create_unique_constraint(uq_name, table, ["examiner_id", "cycle_id", "subject_id"])

    op.drop_table("subject_examiners")
    op.drop_table("examinations")
    op.execute("DROP TYPE IF EXISTS examtype")
    op.execute("DROP TYPE IF EXISTS examseries")
