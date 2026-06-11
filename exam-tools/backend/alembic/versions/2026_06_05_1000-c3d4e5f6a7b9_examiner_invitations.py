"""examiner invitations and examiner phone fields

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6aa
Create Date: 2026-06-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3d4e5f6a7b9"
down_revision: Union[str, None] = "b2c3d4e5f6aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EXAMINER_TYPE_ENUM = postgresql.ENUM(
    "CHIEF",
    "ASSISTANT",
    "TEAM_LEADER",
    name="examinertype",
    create_type=False,
)

REGION_ENUM = postgresql.ENUM(
    "ASHANTI",
    "BONO",
    "BONO_EAST",
    "AHAFO",
    "CENTRAL",
    "EASTERN",
    "GREATER_ACCRA",
    "NORTHERN",
    "NORTH_EAST",
    "SAVANNAH",
    "UPPER_EAST",
    "UPPER_WEST",
    "VOLTA",
    "OTI",
    "WESTERN",
    "WESTERN_NORTH",
    name="region",
    create_type=False,
)

EXAMINER_INVITATION_STATUS_ENUM = postgresql.ENUM(
    "pending",
    "accepted",
    "declined",
    "expired",
    name="examinerinvitationstatus",
    create_type=False,
)


def upgrade() -> None:
    EXAMINER_INVITATION_STATUS_ENUM.create(op.get_bind(), checkfirst=True)

    op.add_column("examiners", sa.Column("phone_number", sa.String(length=50), nullable=True))
    op.add_column("examiners", sa.Column("msisdn", sa.String(length=20), nullable=True))
    op.create_index("ix_examiners_msisdn", "examiners", ["msisdn"], unique=False)
    op.create_unique_constraint("uq_examiners_examination_msisdn", "examiners", ["examination_id", "msisdn"])

    op.create_table(
        "examiner_invitations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("examination_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("phone_number", sa.String(length=50), nullable=False),
        sa.Column("msisdn", sa.String(length=20), nullable=False),
        sa.Column("examiner_type", EXAMINER_TYPE_ENUM, nullable=False),
        sa.Column("region", REGION_ENUM, nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(), nullable=False),
        sa.Column("status", EXAMINER_INVITATION_STATUS_ENUM, nullable=False),
        sa.Column("invited_by_user_id", sa.UUID(), nullable=True),
        sa.Column("notified_at", sa.DateTime(), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("response_deadline", sa.DateTime(), nullable=False),
        sa.Column("examiner_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["examiner_id"], ["examiners.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["examination_id"], ["examinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_examiner_invitations_examination_id", "examiner_invitations", ["examination_id"])
    op.create_index("ix_examiner_invitations_subject_id", "examiner_invitations", ["subject_id"])
    op.create_index("ix_examiner_invitations_msisdn", "examiner_invitations", ["msisdn"])
    op.create_index("ix_examiner_invitations_status", "examiner_invitations", ["status"])
    op.create_index("ix_examiner_invitations_token", "examiner_invitations", ["token"])
    op.create_index("ix_examiner_invitations_examiner_id", "examiner_invitations", ["examiner_id"])
    op.create_index("ix_examiner_invitations_invited_by_user_id", "examiner_invitations", ["invited_by_user_id"])
    op.create_index(
        "ix_examiner_invitations_pending_exam_msisdn",
        "examiner_invitations",
        ["examination_id", "msisdn"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.alter_column("sms_deliveries", "user_id", existing_type=sa.UUID(), nullable=True)
    op.add_column("sms_deliveries", sa.Column("examiner_invitation_id", sa.UUID(), nullable=True))
    op.create_index(
        "ix_sms_deliveries_examiner_invitation_id",
        "sms_deliveries",
        ["examiner_invitation_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_sms_deliveries_examiner_invitation_id",
        "sms_deliveries",
        "examiner_invitations",
        ["examiner_invitation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_sms_deliveries_recipient",
        "sms_deliveries",
        "user_id IS NOT NULL OR examiner_invitation_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint("ck_sms_deliveries_recipient", "sms_deliveries", type_="check")
    op.drop_constraint("fk_sms_deliveries_examiner_invitation_id", "sms_deliveries", type_="foreignkey")
    op.drop_index("ix_sms_deliveries_examiner_invitation_id", table_name="sms_deliveries")
    op.drop_column("sms_deliveries", "examiner_invitation_id")
    op.alter_column("sms_deliveries", "user_id", existing_type=sa.UUID(), nullable=False)

    op.drop_index("ix_examiner_invitations_pending_exam_msisdn", table_name="examiner_invitations")
    op.drop_index("ix_examiner_invitations_invited_by_user_id", table_name="examiner_invitations")
    op.drop_index("ix_examiner_invitations_examiner_id", table_name="examiner_invitations")
    op.drop_index("ix_examiner_invitations_token", table_name="examiner_invitations")
    op.drop_index("ix_examiner_invitations_status", table_name="examiner_invitations")
    op.drop_index("ix_examiner_invitations_msisdn", table_name="examiner_invitations")
    op.drop_index("ix_examiner_invitations_subject_id", table_name="examiner_invitations")
    op.drop_index("ix_examiner_invitations_examination_id", table_name="examiner_invitations")
    op.drop_table("examiner_invitations")

    op.drop_constraint("uq_examiners_examination_msisdn", "examiners", type_="unique")
    op.drop_index("ix_examiners_msisdn", table_name="examiners")
    op.drop_column("examiners", "msisdn")
    op.drop_column("examiners", "phone_number")

    EXAMINER_INVITATION_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
