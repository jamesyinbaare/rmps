"""Per-examination appointment letter signatory and CC settings.

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-06-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "x3y4z5a6b7c8"
down_revision: str | Sequence[str] | None = "w2x3y4z5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "examination_examiner_appointment_letter_settings",
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column(
            "signing_official",
            sa.String(length=64),
            nullable=False,
            server_default="director_assessment_certification",
        ),
        sa.Column(
            "signed_for_director_general",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("director_general_name", sa.String(length=255), nullable=True),
        sa.Column("director_general_title", sa.String(length=255), nullable=True),
        sa.Column("director_general_signature_path", sa.String(length=512), nullable=True),
        sa.Column("director_assessment_name", sa.String(length=255), nullable=True),
        sa.Column("director_assessment_title", sa.String(length=255), nullable=True),
        sa.Column("director_assessment_signature_path", sa.String(length=512), nullable=True),
        sa.Column("cc_lines", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("examination_id"),
    )


def downgrade() -> None:
    op.drop_table("examination_examiner_appointment_letter_settings")
