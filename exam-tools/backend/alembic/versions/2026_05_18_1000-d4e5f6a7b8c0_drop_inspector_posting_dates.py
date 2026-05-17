"""drop inspector posting effective dates

Revision ID: d4e5f6a7b8c0
Revises: b1c2d3e4f5a6
Create Date: 2026-05-18

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision = "d4e5f6a7b8c0"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_inspector_exam_posting_dates", "inspector_exam_postings", type_="check")
    op.drop_column("inspector_exam_postings", "effective_from")
    op.drop_column("inspector_exam_postings", "effective_to")


def downgrade() -> None:
    op.add_column(
        "inspector_exam_postings",
        sa.Column("effective_from", sa.Date(), nullable=True),
    )
    op.add_column(
        "inspector_exam_postings",
        sa.Column("effective_to", sa.Date(), nullable=True),
    )
    op.execute(
        text(
            "UPDATE inspector_exam_postings SET effective_from = date '1970-01-01', "
            "effective_to = date '1970-01-01'"
        )
    )
    op.alter_column("inspector_exam_postings", "effective_from", nullable=False)
    op.alter_column("inspector_exam_postings", "effective_to", nullable=False)
    op.create_check_constraint(
        "ck_inspector_exam_posting_dates",
        "inspector_exam_postings",
        "effective_from <= effective_to",
    )
