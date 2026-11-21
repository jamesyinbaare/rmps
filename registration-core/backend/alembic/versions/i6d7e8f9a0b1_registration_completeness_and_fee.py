"""Registration completeness statuses and per-candidate fee payment

Revision ID: i6d7e8f9a0b1
Revises: h5c6d7e8f9a0
Create Date: 2026-03-21 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect


revision: str = "i6d7e8f9a0b1"
down_revision: Union[str, Sequence[str], None] = "h5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_enum_value_if_missing(enum_name: str, label: str) -> None:
    """ADD VALUE must run outside a transaction before the new label is usable."""
    op.execute(
        f"""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = '{label}'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = '{enum_name}')
            ) THEN
                ALTER TYPE {enum_name} ADD VALUE '{label}';
            END IF;
        END $$;
        """
    )


def upgrade() -> None:
    # PostgreSQL forbids using newly added enum labels in the same transaction.
    with op.get_context().autocommit_block():
        _add_enum_value_if_missing("registrationstatus", "INCOMPLETE")
        _add_enum_value_if_missing("registrationstatus", "COMPLETE")

    bind = op.get_bind()
    inspector = inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns("registration_candidates")}
    existing_indexes = {i["name"] for i in inspector.get_indexes("registration_candidates")}

    fee_status = postgresql.ENUM(
        "not_required",
        "unpaid",
        "paid",
        "waived",
        name="feepaymentstatus",
        create_type=False,
    )
    fee_status.create(bind, checkfirst=True)

    if "fee_payment_status" not in existing_cols:
        op.add_column(
            "registration_candidates",
            sa.Column(
                "fee_payment_status",
                postgresql.ENUM(
                    "not_required",
                    "unpaid",
                    "paid",
                    "waived",
                    name="feepaymentstatus",
                    create_type=False,
                ),
                nullable=False,
                server_default="unpaid",
            ),
        )
    if "fee_paid_at" not in existing_cols:
        op.add_column(
            "registration_candidates",
            sa.Column("fee_paid_at", sa.DateTime(), nullable=True),
        )
    if "fee_paid_by_user_id" not in existing_cols:
        op.add_column(
            "registration_candidates",
            sa.Column(
                "fee_paid_by_user_id",
                sa.UUID(),
                sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    if "ix_registration_candidates_fee_payment_status" not in existing_indexes:
        op.create_index(
            "ix_registration_candidates_fee_payment_status",
            "registration_candidates",
            ["fee_payment_status"],
        )
    if "ix_registration_candidates_fee_paid_by_user_id" not in existing_indexes:
        op.create_index(
            "ix_registration_candidates_fee_paid_by_user_id",
            "registration_candidates",
            ["fee_paid_by_user_id"],
        )

    # Backfill fee_payment_status by registration type and existing payments
    op.execute("""
        UPDATE registration_candidates
        SET fee_payment_status = 'not_required'
        WHERE registration_type = 'free_tvet'
    """)
    op.execute("""
        UPDATE registration_candidates rc
        SET fee_payment_status = 'paid',
            fee_paid_at = COALESCE(rc.fee_paid_at, rc.updated_at, rc.created_at)
        WHERE rc.registration_type = 'private'
          AND (
            COALESCE(rc.total_paid_amount, 0) > 0
            OR EXISTS (
              SELECT 1 FROM invoices i
              WHERE i.registration_candidate_id = rc.id
                AND i.status = 'paid'
            )
          )
    """)

    # Map legacy statuses to incompleteness baseline (safe now that enum labels are committed)
    op.execute("""
        UPDATE registration_candidates
        SET registration_status = 'INCOMPLETE'
        WHERE registration_status::text IN ('PENDING', 'REJECTED', 'APPROVED')
    """)

    # Recompute COMPLETE where photo exists and fee is satisfied (non-draft)
    op.execute("""
        UPDATE registration_candidates rc
        SET registration_status = 'COMPLETE'
        WHERE rc.registration_status::text != 'DRAFT'
          AND EXISTS (
            SELECT 1 FROM registration_candidate_photos p
            WHERE p.registration_candidate_id = rc.id
          )
          AND rc.fee_payment_status::text IN ('not_required', 'paid', 'waived')
    """)


def downgrade() -> None:
    # Best-effort reverse: map new statuses back to legacy ones
    op.execute("""
        UPDATE registration_candidates
        SET registration_status = 'APPROVED'
        WHERE registration_status::text = 'COMPLETE'
    """)
    op.execute("""
        UPDATE registration_candidates
        SET registration_status = 'PENDING'
        WHERE registration_status::text = 'INCOMPLETE'
    """)

    bind = op.get_bind()
    inspector = inspect(bind)
    existing_indexes = {i["name"] for i in inspector.get_indexes("registration_candidates")}
    existing_cols = {c["name"] for c in inspector.get_columns("registration_candidates")}

    if "ix_registration_candidates_fee_paid_by_user_id" in existing_indexes:
        op.drop_index(
            "ix_registration_candidates_fee_paid_by_user_id",
            table_name="registration_candidates",
        )
    if "ix_registration_candidates_fee_payment_status" in existing_indexes:
        op.drop_index(
            "ix_registration_candidates_fee_payment_status",
            table_name="registration_candidates",
        )
    if "fee_paid_by_user_id" in existing_cols:
        op.drop_column("registration_candidates", "fee_paid_by_user_id")
    if "fee_paid_at" in existing_cols:
        op.drop_column("registration_candidates", "fee_paid_at")
    if "fee_payment_status" in existing_cols:
        op.drop_column("registration_candidates", "fee_payment_status")

    op.execute("DROP TYPE IF EXISTS feepaymentstatus")
