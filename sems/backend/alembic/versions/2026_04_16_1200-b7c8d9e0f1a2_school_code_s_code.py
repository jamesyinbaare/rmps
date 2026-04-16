"""Widen school code to 15 chars and add derived s_code.

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-04-16 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "schools",
        "code",
        existing_type=sa.String(length=6),
        type_=sa.String(length=15),
        existing_nullable=False,
    )

    op.add_column("schools", sa.Column("s_code", sa.String(length=20), nullable=True))

    bind = op.get_bind()
    from app.utils.school_code import derive_s_code

    rows = bind.execute(text("SELECT id, code FROM schools")).mappings().all()
    for row in rows:
        s_code = derive_s_code(row["code"])
        bind.execute(
            text("UPDATE schools SET s_code = :s_code WHERE id = :id"),
            {"s_code": s_code, "id": row["id"]},
        )

    op.alter_column("schools", "s_code", existing_type=sa.String(length=20), nullable=False)
    op.create_index(op.f("ix_schools_s_code"), "schools", ["s_code"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_schools_s_code"), table_name="schools")
    op.drop_column("schools", "s_code")
    op.alter_column(
        "schools",
        "code",
        existing_type=sa.String(length=15),
        type_=sa.String(length=6),
        existing_nullable=False,
    )
