"""Require certificate templates to belong to an examination.

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-08-10 18:05:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Templates without an exam cannot be used under exam-scoped printing.
    op.execute("DELETE FROM certificate_templates WHERE exam_id IS NULL")

    op.drop_constraint(
        "certificate_templates_exam_id_fkey",
        "certificate_templates",
        type_="foreignkey",
    )
    op.alter_column(
        "certificate_templates",
        "exam_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_foreign_key(
        "certificate_templates_exam_id_fkey",
        "certificate_templates",
        "exams",
        ["exam_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "certificate_templates_exam_id_fkey",
        "certificate_templates",
        type_="foreignkey",
    )
    op.alter_column(
        "certificate_templates",
        "exam_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.create_foreign_key(
        "certificate_templates_exam_id_fkey",
        "certificate_templates",
        "exams",
        ["exam_id"],
        ["id"],
        ondelete="SET NULL",
    )
