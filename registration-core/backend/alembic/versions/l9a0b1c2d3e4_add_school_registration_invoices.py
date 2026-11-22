"""Add school registration invoices and bank deposit proofs

Revision ID: l9a0b1c2d3e4
Revises: k8f9a0b1c2d3
Create Date: 2026-11-22 11:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "l9a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "k8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    school_invoice_status = postgresql.ENUM(
        "draft",
        "pending",
        "awaiting_bank_confirmation",
        "paid",
        "cancelled",
        name="schoolregistrationinvoicestatus",
        create_type=False,
    )
    school_invoice_payment_method = postgresql.ENUM(
        "paystack",
        "bank_deposit",
        name="schoolinvoicepaymentmethod",
        create_type=False,
    )
    bank_deposit_proof_status = postgresql.ENUM(
        "pending_review",
        "approved",
        "rejected",
        name="bankdepositproofstatus",
        create_type=False,
    )

    bind = op.get_bind()
    school_invoice_status.create(bind, checkfirst=True)
    school_invoice_payment_method.create(bind, checkfirst=True)
    bank_deposit_proof_status.create(bind, checkfirst=True)

    op.create_table(
        "school_registration_invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_number", sa.String(length=50), nullable=False),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "exam_id",
            sa.Integer(),
            sa.ForeignKey("registration_exams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="GHS"),
        sa.Column(
            "status",
            school_invoice_status,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("payment_method", school_invoice_payment_method, nullable=True),
        sa.Column(
            "linked_invoice_id",
            sa.Integer(),
            sa.ForeignKey("invoices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column(
            "confirmed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_school_registration_invoices_invoice_number", "school_registration_invoices", ["invoice_number"], unique=True)
    op.create_index("ix_school_registration_invoices_school_id", "school_registration_invoices", ["school_id"])
    op.create_index("ix_school_registration_invoices_exam_id", "school_registration_invoices", ["exam_id"])
    op.create_index("ix_school_registration_invoices_status", "school_registration_invoices", ["status"])
    op.create_index(
        "ix_school_registration_invoices_linked_invoice_id",
        "school_registration_invoices",
        ["linked_invoice_id"],
        unique=True,
    )
    op.create_index(
        "ix_school_registration_invoices_created_by_user_id",
        "school_registration_invoices",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_school_registration_invoices_confirmed_by_user_id",
        "school_registration_invoices",
        ["confirmed_by_user_id"],
    )

    op.create_table(
        "school_registration_invoice_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "invoice_id",
            sa.Integer(),
            sa.ForeignKey("school_registration_invoices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            sa.Integer(),
            sa.ForeignKey("registration_candidates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("invoice_id", "candidate_id", name="uq_school_invoice_candidate"),
    )
    op.create_index(
        "ix_school_registration_invoice_items_invoice_id",
        "school_registration_invoice_items",
        ["invoice_id"],
    )
    op.create_index(
        "ix_school_registration_invoice_items_candidate_id",
        "school_registration_invoice_items",
        ["candidate_id"],
    )

    op.create_table(
        "bank_deposit_proofs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "school_registration_invoice_id",
            sa.Integer(),
            sa.ForeignKey("school_registration_invoices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("deposit_reference", sa.String(length=100), nullable=True),
        sa.Column("deposited_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "status",
            bank_deposit_proof_status,
            nullable=False,
            server_default="pending_review",
        ),
        sa.Column(
            "uploaded_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "reviewed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_bank_deposit_proofs_school_registration_invoice_id",
        "bank_deposit_proofs",
        ["school_registration_invoice_id"],
    )
    op.create_index("ix_bank_deposit_proofs_status", "bank_deposit_proofs", ["status"])
    op.create_index(
        "ix_bank_deposit_proofs_uploaded_by_user_id",
        "bank_deposit_proofs",
        ["uploaded_by_user_id"],
    )
    op.create_index(
        "ix_bank_deposit_proofs_reviewed_by_user_id",
        "bank_deposit_proofs",
        ["reviewed_by_user_id"],
    )


def downgrade() -> None:
    op.drop_table("bank_deposit_proofs")
    op.drop_table("school_registration_invoice_items")
    op.drop_table("school_registration_invoices")

    bind = op.get_bind()
    postgresql.ENUM(name="bankdepositproofstatus").drop(bind, checkfirst=True)
    postgresql.ENUM(name="schoolinvoicepaymentmethod").drop(bind, checkfirst=True)
    postgresql.ENUM(name="schoolregistrationinvoicestatus").drop(bind, checkfirst=True)
