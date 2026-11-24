"""Persisted school registration fee invoices, Paystack/bank settlement, and KPIs."""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import (
    BankDepositProof,
    BankDepositProofStatus,
    FeePaymentStatus,
    Invoice,
    RegistrationCandidate,
    RegistrationExam,
    RegistrationStatus,
    RegistrationType,
    School,
    SchoolInvoicePaymentMethod,
    SchoolRegistrationInvoice,
    SchoolRegistrationInvoiceItem,
    SchoolRegistrationInvoiceStatus,
)
from app.services.invoice_service import generate_invoice_number
from app.services.pdf_generator import PdfGenerator, render_html
from app.services.registration_completeness import (
    apply_fee_paid,
    recompute_registration_status,
    requires_fee,
)
from app.services.registration_pricing_service import calculate_registration_amount
from app.services.storage.factory import get_storage_backend

logger = logging.getLogger(__name__)

PAYABLE_TYPES = {
    RegistrationType.FEE_PAYING.value,
    RegistrationType.REFERRAL.value,
    RegistrationType.PRIVATE.value,
}
# Draft (e.g. free-tvet download-only) does not lock candidates for payment invoices
OPEN_INVOICE_STATUSES = {
    SchoolRegistrationInvoiceStatus.PENDING,
    SchoolRegistrationInvoiceStatus.AWAITING_BANK_CONFIRMATION,
}
REUSABLE_INVOICE_STATUSES = {
    SchoolRegistrationInvoiceStatus.DRAFT,
    SchoolRegistrationInvoiceStatus.PENDING,
    SchoolRegistrationInvoiceStatus.AWAITING_BANK_CONFIRMATION,
}


def _type_value(reg_type: RegistrationType | str | None) -> str | None:
    if reg_type is None:
        return None
    return reg_type.value if isinstance(reg_type, RegistrationType) else str(reg_type)


def _as_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value or 0))


async def get_candidate_fee_outstanding(
    session: AsyncSession,
    candidate: RegistrationCandidate,
) -> Decimal:
    """Outstanding fee = max(0, current registration fee − total_paid_amount)."""
    try:
        current = (await calculate_registration_amount(session, candidate.id))["total"]
    except Exception as exc:
        logger.warning("Failed to price candidate %s: %s", candidate.id, exc)
        current = Decimal("0")
    outstanding = _as_decimal(current) - _as_decimal(candidate.total_paid_amount)
    return max(Decimal("0"), outstanding)


async def sync_fee_payment_status_from_outstanding(
    session: AsyncSession,
    candidate: RegistrationCandidate,
) -> Decimal:
    """
    Keep fee_payment_status aligned with outstanding balance after selection changes.
    Payable candidates with outstanding > 0 become unpaid so they reappear in fees UI.
    """
    if not requires_fee(candidate.registration_type):
        return Decimal("0")

    outstanding = await get_candidate_fee_outstanding(session, candidate)
    if outstanding > 0:
        candidate.fee_payment_status = FeePaymentStatus.UNPAID
        candidate.fee_paid_at = None
        candidate.fee_paid_by_user_id = None
    else:
        apply_fee_paid(candidate)
    return outstanding


def compute_invoice_content_fingerprint(
    lines: Sequence[dict[str, Any]],
) -> str:
    """Stable hash of sorted (candidate_id, programme_id, subject_ids, line_amount)."""
    payload = [
        {
            "candidate_id": line["candidate_id"],
            "programme_id": line.get("programme_id"),
            "subject_ids": list(line.get("subject_ids") or []),
            "amount": f"{_as_decimal(line['amount']):.2f}",
        }
        for line in sorted(lines, key=lambda row: int(row["candidate_id"]))
    ]
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _candidate_subject_ids(candidate: RegistrationCandidate) -> list[int]:
    return sorted(
        {
            int(sel.subject_id)
            for sel in (candidate.subject_selections or [])
            if sel.subject_id is not None
        }
    )


async def generate_school_fee_invoice_number(session: AsyncSession) -> str:
    """Generate SRI-YYYYMMDD-XXXXXX unique invoice number."""
    today = datetime.utcnow().date()
    date_prefix = today.strftime("%Y%m%d")
    prefix = f"SRI-{date_prefix}-"

    stmt = select(func.count(SchoolRegistrationInvoice.id)).where(
        SchoolRegistrationInvoice.invoice_number.like(f"{prefix}%")
    )
    count = (await session.execute(stmt)).scalar() or 0
    sequence = str(count + 1).zfill(6)
    invoice_number = f"{prefix}{sequence}"

    existing = await session.execute(
        select(SchoolRegistrationInvoice.id).where(
            SchoolRegistrationInvoice.invoice_number == invoice_number
        )
    )
    if existing.scalar_one_or_none():
        sequence = str(count + 2).zfill(6)
        invoice_number = f"{prefix}{sequence}"
    return invoice_number


def _invoice_load_options():
    return (
        selectinload(SchoolRegistrationInvoice.items).selectinload(
            SchoolRegistrationInvoiceItem.candidate
        ),
        selectinload(SchoolRegistrationInvoice.bank_deposit_proofs),
        selectinload(SchoolRegistrationInvoice.school),
        selectinload(SchoolRegistrationInvoice.exam),
    )


async def _find_reusable_invoice(
    session: AsyncSession,
    *,
    school_id: int,
    exam_id: int,
    content_fingerprint: str,
) -> SchoolRegistrationInvoice | None:
    stmt = (
        select(SchoolRegistrationInvoice)
        .where(
            SchoolRegistrationInvoice.school_id == school_id,
            SchoolRegistrationInvoice.exam_id == exam_id,
            SchoolRegistrationInvoice.content_fingerprint == content_fingerprint,
            SchoolRegistrationInvoice.status.in_(
                [s.value for s in REUSABLE_INVOICE_STATUSES]
            ),
        )
        .order_by(SchoolRegistrationInvoice.id.desc())
        .options(*_invoice_load_options())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_invoice(
    session: AsyncSession,
    invoice_id: int,
    *,
    school_id: int | None = None,
) -> SchoolRegistrationInvoice | None:
    stmt = (
        select(SchoolRegistrationInvoice)
        .where(SchoolRegistrationInvoice.id == invoice_id)
        .options(*_invoice_load_options())
    )
    if school_id is not None:
        stmt = stmt.where(SchoolRegistrationInvoice.school_id == school_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_invoices(
    session: AsyncSession,
    *,
    school_id: int | None = None,
    exam_id: int | None = None,
    status_filter: str | None = None,
    limit: int = 50,
) -> list[SchoolRegistrationInvoice]:
    stmt = (
        select(SchoolRegistrationInvoice)
        .options(*_invoice_load_options())
        .order_by(SchoolRegistrationInvoice.created_at.desc())
        .limit(limit)
    )
    if school_id is not None:
        stmt = stmt.where(SchoolRegistrationInvoice.school_id == school_id)
    if exam_id is not None:
        stmt = stmt.where(SchoolRegistrationInvoice.exam_id == exam_id)
    if status_filter:
        stmt = stmt.where(SchoolRegistrationInvoice.status == status_filter)
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())


async def _open_invoices_by_candidate(
    session: AsyncSession,
    candidate_ids: Sequence[int],
) -> dict[int, dict[str, Any]]:
    """Map candidate_id → open invoice summary (latest open invoice wins)."""
    if not candidate_ids:
        return {}
    stmt = (
        select(
            SchoolRegistrationInvoiceItem.candidate_id,
            SchoolRegistrationInvoice.invoice_number,
            SchoolRegistrationInvoice.status,
            SchoolRegistrationInvoice.amount,
            SchoolRegistrationInvoice.id,
        )
        .join(SchoolRegistrationInvoice)
        .where(
            SchoolRegistrationInvoiceItem.candidate_id.in_(list(candidate_ids)),
            SchoolRegistrationInvoice.status.in_(
                [s.value for s in OPEN_INVOICE_STATUSES]
            ),
        )
        .order_by(SchoolRegistrationInvoice.id.desc())
    )
    rows = (await session.execute(stmt)).all()
    by_candidate: dict[int, dict[str, Any]] = {}
    for candidate_id, invoice_number, status, amount, _invoice_id in rows:
        if candidate_id in by_candidate:
            continue
        status_val = status.value if hasattr(status, "value") else str(status)
        by_candidate[int(candidate_id)] = {
            "invoice_number": invoice_number,
            "status": status_val,
            "amount": amount,
        }
    return by_candidate


async def _candidate_ids_on_open_invoices(
    session: AsyncSession,
    candidate_ids: Sequence[int],
) -> set[int]:
    return set(
        (await _open_invoices_by_candidate(session, candidate_ids)).keys()
    )


async def get_fees_summary(
    session: AsyncSession,
    *,
    school_id: int | None = None,
    exam_id: int | None = None,
) -> dict[str, Any]:
    """KPI: outstanding amount due + candidate counts for payable types."""
    filters = [
        RegistrationCandidate.registration_type.in_(list(PAYABLE_TYPES)),
        RegistrationCandidate.registration_status != RegistrationStatus.DRAFT,
        RegistrationCandidate.fee_payment_status.in_(
            [FeePaymentStatus.UNPAID, FeePaymentStatus.PAID]
        ),
    ]
    if school_id is not None:
        filters.append(RegistrationCandidate.school_id == school_id)
    if exam_id is not None:
        filters.append(RegistrationCandidate.registration_exam_id == exam_id)

    stmt = (
        select(RegistrationCandidate)
        .where(and_(*filters))
        .options(selectinload(RegistrationCandidate.subject_selections))
    )
    candidates = list((await session.execute(stmt)).scalars().unique().all())

    by_type: dict[str, dict[str, Any]] = {}
    total_amount = Decimal("0")
    counted = 0
    for candidate in candidates:
        outstanding = await get_candidate_fee_outstanding(session, candidate)
        if outstanding <= 0:
            continue
        type_key = _type_value(candidate.registration_type) or "unknown"
        total_amount += outstanding
        counted += 1
        bucket = by_type.setdefault(
            type_key, {"registration_type": type_key, "candidate_count": 0, "amount_due": Decimal("0")}
        )
        bucket["candidate_count"] += 1
        bucket["amount_due"] += outstanding

    return {
        "school_id": school_id,
        "exam_id": exam_id,
        "amount_due": total_amount,
        "unpaid_candidate_count": counted,
        "by_type": list(by_type.values()),
    }


async def get_fees_summary_by_exam(
    session: AsyncSession,
    *,
    school_id: int,
) -> dict[str, Any]:
    """Per-exam outstanding amount due + candidate counts for a school."""
    filters = [
        RegistrationCandidate.school_id == school_id,
        RegistrationCandidate.registration_type.in_(list(PAYABLE_TYPES)),
        RegistrationCandidate.registration_status != RegistrationStatus.DRAFT,
        RegistrationCandidate.registration_exam_id.isnot(None),
        RegistrationCandidate.fee_payment_status.in_(
            [FeePaymentStatus.UNPAID, FeePaymentStatus.PAID]
        ),
    ]
    stmt = (
        select(RegistrationCandidate)
        .where(and_(*filters))
        .options(selectinload(RegistrationCandidate.subject_selections))
    )
    candidates = list((await session.execute(stmt)).scalars().unique().all())

    by_exam: dict[int, dict[str, Any]] = {}
    for candidate in candidates:
        exam_id = candidate.registration_exam_id
        if exam_id is None:
            continue
        outstanding = await get_candidate_fee_outstanding(session, candidate)
        if outstanding <= 0:
            continue
        bucket = by_exam.setdefault(
            exam_id,
            {
                "exam_id": exam_id,
                "amount_due": Decimal("0"),
                "unpaid_candidate_count": 0,
            },
        )
        bucket["amount_due"] += outstanding
        bucket["unpaid_candidate_count"] += 1

    items = sorted(by_exam.values(), key=lambda row: row["exam_id"])
    return {"items": items}


async def list_fee_candidates(
    session: AsyncSession,
    *,
    exam_id: int,
    school_id: int | None = None,
    registration_type: str | None = None,
    unpaid_only: bool = True,
    include_free_tvet: bool = False,
) -> dict[str, Any]:
    filters = [
        RegistrationCandidate.registration_exam_id == exam_id,
        RegistrationCandidate.registration_status != RegistrationStatus.DRAFT,
    ]
    if school_id is not None:
        filters.append(RegistrationCandidate.school_id == school_id)

    allowed_types = set(PAYABLE_TYPES)
    if include_free_tvet:
        allowed_types.add(RegistrationType.FREE_TVET.value)
    if registration_type:
        if registration_type not in allowed_types:
            raise ValueError(f"Unsupported registration type: {registration_type}")
        filters.append(RegistrationCandidate.registration_type == registration_type)
    else:
        filters.append(RegistrationCandidate.registration_type.in_(list(allowed_types)))

    if unpaid_only:
        status_clauses = [
            RegistrationCandidate.fee_payment_status == FeePaymentStatus.UNPAID,
            and_(
                RegistrationCandidate.registration_type.in_(list(PAYABLE_TYPES)),
                RegistrationCandidate.fee_payment_status == FeePaymentStatus.PAID,
            ),
        ]
        if include_free_tvet:
            status_clauses.append(
                and_(
                    RegistrationCandidate.registration_type
                    == RegistrationType.FREE_TVET.value,
                    RegistrationCandidate.fee_payment_status
                    == FeePaymentStatus.NOT_REQUIRED,
                )
            )
        filters.append(or_(*status_clauses))

    stmt = (
        select(RegistrationCandidate)
        .where(and_(*filters))
        .options(
            selectinload(RegistrationCandidate.subject_selections),
            selectinload(RegistrationCandidate.programme),
        )
        .order_by(RegistrationCandidate.lastname, RegistrationCandidate.firstname)
    )
    candidates = list((await session.execute(stmt)).scalars().unique().all())
    open_by_candidate = await _open_invoices_by_candidate(
        session, [c.id for c in candidates]
    )

    items = []
    total = Decimal("0")
    for candidate in candidates:
        type_val = _type_value(candidate.registration_type)
        if type_val == RegistrationType.FREE_TVET.value:
            amount = Decimal("0")
        else:
            amount = await get_candidate_fee_outstanding(session, candidate)
            if unpaid_only and amount <= 0:
                continue
        total += amount
        open_inv = open_by_candidate.get(candidate.id)
        items.append(
            {
                "id": candidate.id,
                "registration_number": candidate.registration_number,
                "firstname": candidate.firstname,
                "lastname": candidate.lastname,
                "othername": candidate.othername,
                "registration_type": type_val,
                "fee_payment_status": (
                    candidate.fee_payment_status.value
                    if isinstance(candidate.fee_payment_status, FeePaymentStatus)
                    else str(candidate.fee_payment_status)
                ),
                "programme_code": candidate.programme_code
                or (candidate.programme.code if candidate.programme else None),
                "amount": amount,
                "on_open_invoice": open_inv is not None,
                "open_invoice_number": (
                    open_inv["invoice_number"] if open_inv else None
                ),
                "open_invoice_status": open_inv["status"] if open_inv else None,
                "open_invoice_amount": open_inv["amount"] if open_inv else None,
            }
        )

    return {
        "exam_id": exam_id,
        "school_id": school_id,
        "candidates": items,
        "total_amount": total,
        "total_count": len(items),
    }


async def create_school_fee_invoice(
    session: AsyncSession,
    *,
    school_id: int,
    exam_id: int,
    created_by_user_id: UUID | None,
    candidate_ids: Sequence[int] | None = None,
    all_unpaid: bool = False,
    registration_types: Sequence[str] | None = None,
    allow_free_tvet: bool = False,
) -> tuple[SchoolRegistrationInvoice, bool]:
    """
    Create (or reuse) a school fee invoice.

    Returns (invoice, reused) where reused=True when an open/draft invoice with the
    same content fingerprint already exists.
    """
    exam = (
        await session.execute(select(RegistrationExam).where(RegistrationExam.id == exam_id))
    ).scalar_one_or_none()
    if not exam:
        raise ValueError("Registration exam not found")

    school = (
        await session.execute(select(School).where(School.id == school_id))
    ).scalar_one_or_none()
    if not school:
        raise ValueError("School not found")

    if all_unpaid:
        types = list(registration_types or PAYABLE_TYPES)
        if allow_free_tvet and RegistrationType.FREE_TVET.value not in types:
            types.append(RegistrationType.FREE_TVET.value)
        listed = await list_fee_candidates(
            session,
            exam_id=exam_id,
            school_id=school_id,
            unpaid_only=True,
            include_free_tvet=allow_free_tvet,
        )
        type_set = set(types)
        # Include candidates already on open invoices so fingerprint reuse can match
        candidate_ids = [
            c["id"]
            for c in listed["candidates"]
            if c["registration_type"] in type_set
        ]
    elif not candidate_ids:
        raise ValueError("Provide candidate_ids or set all_unpaid=true")

    candidate_ids = list(dict.fromkeys(candidate_ids or []))
    if not candidate_ids:
        raise ValueError("No eligible candidates to invoice")

    stmt = (
        select(RegistrationCandidate)
        .where(
            RegistrationCandidate.id.in_(candidate_ids),
            RegistrationCandidate.school_id == school_id,
            RegistrationCandidate.registration_exam_id == exam_id,
        )
        .options(selectinload(RegistrationCandidate.subject_selections))
    )
    candidates = list((await session.execute(stmt)).scalars().unique().all())
    found = {c.id for c in candidates}
    missing = [cid for cid in candidate_ids if cid not in found]
    if missing:
        raise ValueError(f"Candidates not found for this school/exam: {missing}")

    # Preserve request order
    by_id = {c.id: c for c in candidates}
    ordered_candidates = [by_id[cid] for cid in candidate_ids if cid in by_id]

    line_specs: list[dict[str, Any]] = []
    for candidate in ordered_candidates:
        type_val = _type_value(candidate.registration_type)
        if type_val == RegistrationType.FREE_TVET.value:
            if not allow_free_tvet:
                raise ValueError(
                    f"Candidate {candidate.id} is free_tvet; use allow_free_tvet for download-only invoices"
                )
            amount = Decimal("0")
        elif type_val not in PAYABLE_TYPES:
            raise ValueError(f"Candidate {candidate.id} has unsupported type {type_val}")
        else:
            amount = await get_candidate_fee_outstanding(session, candidate)
            if amount <= 0:
                if all_unpaid:
                    continue
                raise ValueError(
                    f"Candidate {candidate.id} has no outstanding fee balance"
                )
        line_specs.append(
            {
                "candidate_id": candidate.id,
                "programme_id": candidate.programme_id,
                "subject_ids": _candidate_subject_ids(candidate),
                "amount": amount,
                "type": type_val,
            }
        )

    if not line_specs:
        raise ValueError("No eligible candidates to invoice")

    fingerprint = compute_invoice_content_fingerprint(line_specs)
    existing = await _find_reusable_invoice(
        session,
        school_id=school_id,
        exam_id=exam_id,
        content_fingerprint=fingerprint,
    )
    if existing:
        return existing, True

    create_ids = [line["candidate_id"] for line in line_specs]
    open_ids = await _candidate_ids_on_open_invoices(session, create_ids)
    if open_ids:
        # Retry with only candidates not locked on a payment invoice
        free_specs = [
            line for line in line_specs if line["candidate_id"] not in open_ids
        ]
        if not free_specs:
            raise ValueError(
                f"Candidates already on an open invoice: {sorted(open_ids)}"
            )
        line_specs = free_specs
        fingerprint = compute_invoice_content_fingerprint(line_specs)
        existing = await _find_reusable_invoice(
            session,
            school_id=school_id,
            exam_id=exam_id,
            content_fingerprint=fingerprint,
        )
        if existing:
            return existing, True
        still_open = await _candidate_ids_on_open_invoices(
            session, [line["candidate_id"] for line in line_specs]
        )
        if still_open:
            raise ValueError(
                f"Candidates already on an open invoice: {sorted(still_open)}"
            )

    items = [
        SchoolRegistrationInvoiceItem(
            candidate_id=line["candidate_id"],
            amount=_as_decimal(line["amount"]),
        )
        for line in line_specs
    ]
    total = sum((_as_decimal(line["amount"]) for line in line_specs), Decimal("0"))

    only_free_tvet = all(
        line["type"] == RegistrationType.FREE_TVET.value for line in line_specs
    )
    status = (
        SchoolRegistrationInvoiceStatus.DRAFT
        if only_free_tvet
        else SchoolRegistrationInvoiceStatus.PENDING
    )

    invoice = SchoolRegistrationInvoice(
        invoice_number=await generate_school_fee_invoice_number(session),
        school_id=school_id,
        exam_id=exam_id,
        amount=total,
        currency="GHS",
        status=status,
        content_fingerprint=fingerprint,
        created_by_user_id=created_by_user_id,
        items=items,
    )
    session.add(invoice)
    await session.flush()
    created = await get_invoice(session, invoice.id)
    return created, False  # type: ignore[return-value]


async def settle_school_fee_invoice(
    session: AsyncSession,
    invoice: SchoolRegistrationInvoice,
    *,
    confirmed_by_user_id: UUID | None = None,
    paid_at: datetime | None = None,
    payment_method: SchoolInvoicePaymentMethod | None = None,
) -> SchoolRegistrationInvoice:
    """Mark invoice paid and apply line amounts toward candidate fee balances."""
    if invoice.status == SchoolRegistrationInvoiceStatus.PAID:
        return invoice
    if invoice.status == SchoolRegistrationInvoiceStatus.CANCELLED:
        raise ValueError("Cannot settle a cancelled invoice")

    paid_at = paid_at or datetime.utcnow()
    if payment_method is not None:
        invoice.payment_method = payment_method
    invoice.status = SchoolRegistrationInvoiceStatus.PAID
    invoice.paid_at = paid_at
    invoice.confirmed_by_user_id = confirmed_by_user_id

    if invoice.linked_invoice_id:
        linked = (
            await session.execute(
                select(Invoice).where(Invoice.id == invoice.linked_invoice_id)
            )
        ).scalar_one_or_none()
        if linked:
            linked.status = "paid"
            linked.paid_at = paid_at

    # Ensure items loaded
    if not invoice.items:
        await session.refresh(invoice, attribute_names=["items"])

    for item in invoice.items:
        candidate = (
            await session.execute(
                select(RegistrationCandidate)
                .where(RegistrationCandidate.id == item.candidate_id)
                .options(selectinload(RegistrationCandidate.subject_selections))
            )
        ).scalar_one_or_none()
        if not candidate:
            continue
        if not requires_fee(candidate.registration_type):
            continue

        current_paid = _as_decimal(candidate.total_paid_amount)
        candidate.total_paid_amount = current_paid + _as_decimal(item.amount)

        outstanding = await get_candidate_fee_outstanding(session, candidate)
        if outstanding <= 0:
            apply_fee_paid(candidate, user_id=confirmed_by_user_id, at=paid_at)
        else:
            candidate.fee_payment_status = FeePaymentStatus.UNPAID
            candidate.fee_paid_at = None
            candidate.fee_paid_by_user_id = None
        await recompute_registration_status(session, candidate)

    await session.flush()
    return await get_invoice(session, invoice.id)  # type: ignore[return-value]


async def settle_by_linked_invoice_id(
    session: AsyncSession,
    linked_invoice_id: int,
    *,
    paid_at: datetime | None = None,
) -> SchoolRegistrationInvoice | None:
    stmt = (
        select(SchoolRegistrationInvoice)
        .where(SchoolRegistrationInvoice.linked_invoice_id == linked_invoice_id)
        .options(*_invoice_load_options())
    )
    invoice = (await session.execute(stmt)).scalar_one_or_none()
    if not invoice:
        return None
    return await settle_school_fee_invoice(
        session,
        invoice,
        paid_at=paid_at,
        payment_method=SchoolInvoicePaymentMethod.PAYSTACK,
    )


async def start_paystack_payment(
    session: AsyncSession,
    invoice: SchoolRegistrationInvoice,
    *,
    email: str | None = None,
) -> dict[str, Any]:
    from app.services.payment_service import initialize_payment

    if invoice.status not in (
        SchoolRegistrationInvoiceStatus.PENDING,
        SchoolRegistrationInvoiceStatus.AWAITING_BANK_CONFIRMATION,
    ):
        # Allow retry from pending; awaiting bank means they switched methods — cancel slip path
        if invoice.status != SchoolRegistrationInvoiceStatus.PENDING:
            raise ValueError(
                f"Invoice cannot be paid via Paystack in status {invoice.status}"
            )

    # Block free-tvet-only / draft
    if invoice.status == SchoolRegistrationInvoiceStatus.DRAFT or Decimal(str(invoice.amount)) <= 0:
        raise ValueError("This invoice does not require payment")

    # Ensure no free-tvet-only payment
    has_payable = False
    for item in invoice.items:
        cand = item.candidate
        if cand and requires_fee(cand.registration_type):
            has_payable = True
            break
    if not has_payable:
        # Reload candidates if not loaded
        for item in invoice.items:
            cand = (
                await session.execute(
                    select(RegistrationCandidate).where(
                        RegistrationCandidate.id == item.candidate_id
                    )
                )
            ).scalar_one_or_none()
            if cand and requires_fee(cand.registration_type):
                has_payable = True
                break
    if not has_payable:
        raise ValueError("Invoice has no fee-paying candidates")

    if invoice.linked_invoice_id:
        linked = (
            await session.execute(
                select(Invoice).where(Invoice.id == invoice.linked_invoice_id)
            )
        ).scalar_one_or_none()
    else:
        linked = None

    if not linked or linked.status == "cancelled":
        linked = Invoice(
            invoice_number=await generate_invoice_number(session),
            amount=invoice.amount,
            currency=invoice.currency or "GHS",
            status="pending",
            due_date=date.today() + timedelta(days=7),
        )
        session.add(linked)
        await session.flush()
        invoice.linked_invoice_id = linked.id

    invoice.payment_method = SchoolInvoicePaymentMethod.PAYSTACK
    if invoice.status == SchoolRegistrationInvoiceStatus.AWAITING_BANK_CONFIRMATION:
        invoice.status = SchoolRegistrationInvoiceStatus.PENDING

    result = await initialize_payment(
        session,
        linked,
        Decimal(str(invoice.amount)),
        email=email,
        metadata={
            "type": "school_registration_invoice",
            "school_registration_invoice_id": invoice.id,
            "school_id": invoice.school_id,
            "exam_id": invoice.exam_id,
        },
    )
    await session.flush()
    return {
        "authorization_url": result["authorization_url"],
        "reference": result["reference"],
        "invoice_id": linked.id,
        "school_registration_invoice_id": invoice.id,
    }


async def submit_bank_deposit(
    session: AsyncSession,
    invoice: SchoolRegistrationInvoice,
    *,
    file_content: bytes,
    filename: str,
    mime_type: str,
    uploaded_by_user_id: UUID | None,
    deposit_reference: str | None = None,
    deposited_amount: Decimal | None = None,
) -> BankDepositProof:
    if invoice.status not in (
        SchoolRegistrationInvoiceStatus.PENDING,
        SchoolRegistrationInvoiceStatus.AWAITING_BANK_CONFIRMATION,
    ):
        raise ValueError(
            f"Invoice cannot accept bank deposit in status {invoice.status}"
        )
    if invoice.status == SchoolRegistrationInvoiceStatus.DRAFT or Decimal(str(invoice.amount)) <= 0:
        raise ValueError("This invoice does not require payment")

    if not file_content:
        raise ValueError("Pay-in slip file is required")
    if len(file_content) > settings.upload_max_size:
        raise ValueError("Pay-in slip file is too large")

    storage = get_storage_backend(base_path=settings.storage_path)
    ext = Path(filename).suffix or ".pdf"
    custom_name = f"{uuid.uuid4()}{ext}"
    subdir = f"pay-in-slips/{invoice.school_id}/{invoice.id}"
    saved_path, _checksum = await storage.save(
        file_content,
        custom_name,
        subdir=subdir,
        use_custom_filename=True,
    )

    proof = BankDepositProof(
        school_registration_invoice_id=invoice.id,
        file_path=saved_path,
        file_name=filename,
        mime_type=mime_type or "application/octet-stream",
        deposit_reference=deposit_reference,
        deposited_amount=deposited_amount,
        status=BankDepositProofStatus.PENDING_REVIEW,
        uploaded_by_user_id=uploaded_by_user_id,
    )
    session.add(proof)
    invoice.payment_method = SchoolInvoicePaymentMethod.BANK_DEPOSIT
    invoice.status = SchoolRegistrationInvoiceStatus.AWAITING_BANK_CONFIRMATION
    await session.flush()
    await session.refresh(proof)
    return proof


async def approve_bank_deposit(
    session: AsyncSession,
    proof_id: int,
    *,
    reviewed_by_user_id: UUID,
) -> SchoolRegistrationInvoice:
    proof = (
        await session.execute(
            select(BankDepositProof)
            .where(BankDepositProof.id == proof_id)
            .options(
                selectinload(BankDepositProof.invoice).selectinload(
                    SchoolRegistrationInvoice.items
                )
            )
        )
    ).scalar_one_or_none()
    if not proof:
        raise ValueError("Bank deposit proof not found")
    if proof.status != BankDepositProofStatus.PENDING_REVIEW:
        raise ValueError(f"Proof is not pending review (status={proof.status})")

    proof.status = BankDepositProofStatus.APPROVED
    proof.reviewed_by_user_id = reviewed_by_user_id
    proof.reviewed_at = datetime.utcnow()

    invoice = proof.invoice
    if invoice is None:
        invoice = await get_invoice(session, proof.school_registration_invoice_id)
    if not invoice:
        raise ValueError("Associated invoice not found")

    settled = await settle_school_fee_invoice(
        session,
        invoice,
        confirmed_by_user_id=reviewed_by_user_id,
        payment_method=SchoolInvoicePaymentMethod.BANK_DEPOSIT,
    )
    await _notify_bank_deposit_uploader(
        session,
        proof,
        approved=True,
        invoice_number=settled.invoice_number if settled else invoice.invoice_number,
    )
    return settled


async def reject_bank_deposit(
    session: AsyncSession,
    proof_id: int,
    *,
    reviewed_by_user_id: UUID,
    reason: str,
) -> BankDepositProof:
    proof = (
        await session.execute(
            select(BankDepositProof)
            .where(BankDepositProof.id == proof_id)
            .options(selectinload(BankDepositProof.invoice))
        )
    ).scalar_one_or_none()
    if not proof:
        raise ValueError("Bank deposit proof not found")
    if proof.status != BankDepositProofStatus.PENDING_REVIEW:
        raise ValueError(f"Proof is not pending review (status={proof.status})")

    proof.status = BankDepositProofStatus.REJECTED
    proof.reviewed_by_user_id = reviewed_by_user_id
    proof.reviewed_at = datetime.utcnow()
    proof.rejection_reason = reason

    invoice = proof.invoice
    if invoice and invoice.status == SchoolRegistrationInvoiceStatus.AWAITING_BANK_CONFIRMATION:
        # If no other pending proofs, return invoice to pending
        other_pending = (
            await session.execute(
                select(func.count(BankDepositProof.id)).where(
                    BankDepositProof.school_registration_invoice_id == invoice.id,
                    BankDepositProof.status == BankDepositProofStatus.PENDING_REVIEW,
                    BankDepositProof.id != proof.id,
                )
            )
        ).scalar() or 0
        if other_pending == 0:
            invoice.status = SchoolRegistrationInvoiceStatus.PENDING
            invoice.payment_method = None

    await session.flush()
    invoice_number = invoice.invoice_number if invoice else str(proof.school_registration_invoice_id)
    await _notify_bank_deposit_uploader(
        session,
        proof,
        approved=False,
        invoice_number=invoice_number,
        rejection_reason=reason,
    )
    return proof


async def _notify_bank_deposit_uploader(
    session: AsyncSession,
    proof: BankDepositProof,
    *,
    approved: bool,
    invoice_number: str,
    rejection_reason: str | None = None,
) -> None:
    from app.config import settings
    from app.models import PortalUser
    from app.services.email_service import send_bank_deposit_status_email

    if not proof.uploaded_by_user_id:
        return
    uploader = (
        await session.execute(
            select(PortalUser).where(PortalUser.id == proof.uploaded_by_user_id)
        )
    ).scalar_one_or_none()
    if not uploader or not uploader.email:
        return

    base = (settings.frontend_base_url or "http://localhost:3002").rstrip("/")
    send_bank_deposit_status_email(
        to=uploader.email,
        recipient_name=uploader.full_name or uploader.email,
        invoice_number=invoice_number,
        approved=approved,
        rejection_reason=rejection_reason,
        dashboard_url=f"{base}/dashboard/my-school",
    )


async def list_bank_deposits(
    session: AsyncSession,
    *,
    status_filter: str = BankDepositProofStatus.PENDING_REVIEW.value,
    school_id: int | None = None,
    limit: int = 100,
) -> list[BankDepositProof]:
    stmt = (
        select(BankDepositProof)
        .join(SchoolRegistrationInvoice)
        .options(
            selectinload(BankDepositProof.invoice).selectinload(
                SchoolRegistrationInvoice.school
            ),
            selectinload(BankDepositProof.invoice).selectinload(
                SchoolRegistrationInvoice.exam
            ),
        )
        .order_by(BankDepositProof.created_at.asc())
        .limit(limit)
    )
    if status_filter and status_filter.strip():
        stmt = stmt.where(BankDepositProof.status == status_filter)
    if school_id is not None:
        stmt = stmt.where(SchoolRegistrationInvoice.school_id == school_id)
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())


async def read_bank_deposit_file(proof: BankDepositProof) -> bytes:
    storage = get_storage_backend(base_path=settings.storage_path)
    return await storage.retrieve(proof.file_path)


async def generate_school_fee_invoice_pdf(
    session: AsyncSession,
    invoice: SchoolRegistrationInvoice,
) -> bytes:
    school = invoice.school
    exam = invoice.exam
    if not school:
        school = (
            await session.execute(select(School).where(School.id == invoice.school_id))
        ).scalar_one()
    if not exam:
        exam = (
            await session.execute(
                select(RegistrationExam).where(RegistrationExam.id == invoice.exam_id)
            )
        ).scalar_one()

    if not invoice.items:
        await session.refresh(invoice, attribute_names=["items"])

    line_items = []
    for item in invoice.items:
        candidate = item.candidate
        if not candidate:
            candidate = (
                await session.execute(
                    select(RegistrationCandidate).where(
                        RegistrationCandidate.id == item.candidate_id
                    )
                )
            ).scalar_one_or_none()
        line_items.append(
            {
                "registration_number": candidate.registration_number if candidate else str(item.candidate_id),
                "name": candidate.name if candidate else "",
                "registration_type": _type_value(candidate.registration_type) if candidate else "",
                "amount": float(item.amount),
            }
        )

    context = {
        "invoice_number": invoice.invoice_number,
        "school": {"id": school.id, "code": school.code, "name": school.name},
        "exam": {
            "id": exam.id,
            "type": exam.exam_type,
            "series": exam.exam_series,
            "year": exam.year,
        },
        "candidate_count": len(line_items),
        "total_amount": float(invoice.amount),
        "status": invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status),
        "line_items": line_items,
        "generated_at": datetime.utcnow(),
    }

    templates_dir = Path(__file__).parent.parent / "templates"
    main_html = render_html(
        context, "invoices/school_fee_invoice.html", templates_dir
    )
    app_dir = Path(__file__).parent.parent.resolve()
    pdf_gen = PdfGenerator(
        main_html=main_html,
        header_html=None,
        footer_html=None,
        base_url=str(app_dir),
        side_margin=1.5,
        extra_vertical_margin=20,
    )
    return pdf_gen.render_pdf()


def serialize_invoice(
    invoice: SchoolRegistrationInvoice,
    *,
    reused: bool = False,
) -> dict[str, Any]:
    items = []
    for item in invoice.items or []:
        cand = item.candidate
        items.append(
            {
                "id": item.id,
                "candidate_id": item.candidate_id,
                "amount": item.amount,
                "registration_number": cand.registration_number if cand else None,
                "candidate_name": cand.name if cand else None,
                "registration_type": _type_value(cand.registration_type) if cand else None,
            }
        )
    proofs = []
    for proof in invoice.bank_deposit_proofs or []:
        proofs.append(
            {
                "id": proof.id,
                "school_registration_invoice_id": proof.school_registration_invoice_id,
                "file_name": proof.file_name,
                "mime_type": proof.mime_type,
                "deposit_reference": proof.deposit_reference,
                "deposited_amount": proof.deposited_amount,
                "status": proof.status.value if hasattr(proof.status, "value") else str(proof.status),
                "uploaded_by_user_id": proof.uploaded_by_user_id,
                "reviewed_by_user_id": proof.reviewed_by_user_id,
                "reviewed_at": proof.reviewed_at,
                "rejection_reason": proof.rejection_reason,
                "created_at": proof.created_at,
            }
        )
    school = invoice.school
    exam = invoice.exam
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "school_id": invoice.school_id,
        "exam_id": invoice.exam_id,
        "amount": invoice.amount,
        "currency": invoice.currency,
        "status": invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status),
        "payment_method": (
            invoice.payment_method.value
            if invoice.payment_method and hasattr(invoice.payment_method, "value")
            else invoice.payment_method
        ),
        "linked_invoice_id": invoice.linked_invoice_id,
        "created_by_user_id": invoice.created_by_user_id,
        "paid_at": invoice.paid_at,
        "confirmed_by_user_id": invoice.confirmed_by_user_id,
        "created_at": invoice.created_at,
        "updated_at": invoice.updated_at,
        "item_count": len(items),
        "items": items,
        "bank_deposit_proofs": proofs,
        "school_name": school.name if school else None,
        "school_code": school.code if school else None,
        "exam_type": exam.exam_type if exam else None,
        "exam_series": exam.exam_series if exam else None,
        "exam_year": exam.year if exam else None,
        "reused": reused,
    }


def serialize_bank_deposit(proof: BankDepositProof) -> dict[str, Any]:
    invoice = proof.invoice
    school = invoice.school if invoice else None
    return {
        "id": proof.id,
        "school_registration_invoice_id": proof.school_registration_invoice_id,
        "file_name": proof.file_name,
        "mime_type": proof.mime_type,
        "deposit_reference": proof.deposit_reference,
        "deposited_amount": proof.deposited_amount,
        "status": proof.status.value if hasattr(proof.status, "value") else str(proof.status),
        "uploaded_by_user_id": proof.uploaded_by_user_id,
        "reviewed_by_user_id": proof.reviewed_by_user_id,
        "reviewed_at": proof.reviewed_at,
        "rejection_reason": proof.rejection_reason,
        "created_at": proof.created_at,
        "invoice_number": invoice.invoice_number if invoice else None,
        "school_id": invoice.school_id if invoice else None,
        "school_name": school.name if school else None,
        "exam_id": invoice.exam_id if invoice else None,
        "invoice_amount": invoice.amount if invoice else None,
    }
