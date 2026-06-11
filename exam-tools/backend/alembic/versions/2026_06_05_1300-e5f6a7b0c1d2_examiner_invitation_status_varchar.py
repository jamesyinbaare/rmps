"""examiner invitation status varchar column

Revision ID: e5f6a7b0c1d2
Revises: d4e5f6a7b0c1
Create Date: 2026-06-05

Store invitation status as VARCHAR (pending, accepted, …) so SQLAlchemy
values_callable binding works reliably. Drops the native PostgreSQL enum type.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b0c1d2"
down_revision: Union[str, None] = "d4e5f6a7b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    row = conn.execute(
        sa.text(
            """
            SELECT data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = 'examiner_invitations' AND column_name = 'status'
            """
        )
    ).one()
    if row.data_type in ("character varying", "varchar"):
        return

    op.drop_index("ix_examiner_invitations_pending_exam_msisdn", table_name="examiner_invitations")

    op.execute(
        """
        ALTER TABLE examiner_invitations
        ALTER COLUMN status TYPE VARCHAR(16)
        USING lower(status::text)
        """
    )
    op.execute("DROP TYPE IF EXISTS examinerinvitationstatus")

    op.create_index(
        "ix_examiner_invitations_pending_exam_msisdn",
        "examiner_invitations",
        ["examination_id", "msisdn"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    conn = op.get_bind()
    row = conn.execute(
        sa.text(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name = 'examiner_invitations' AND column_name = 'status'
            """
        )
    ).one()
    if row.data_type not in ("character varying", "varchar"):
        return

    op.drop_index("ix_examiner_invitations_pending_exam_msisdn", table_name="examiner_invitations")

    op.execute(
        """
        CREATE TYPE examinerinvitationstatus AS ENUM (
            'pending', 'accepted', 'declined', 'expired'
        )
        """
    )
    op.execute(
        """
        ALTER TABLE examiner_invitations
        ALTER COLUMN status TYPE examinerinvitationstatus
        USING status::examinerinvitationstatus
        """
    )

    op.create_index(
        "ix_examiner_invitations_pending_exam_msisdn",
        "examiner_invitations",
        ["examination_id", "msisdn"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
