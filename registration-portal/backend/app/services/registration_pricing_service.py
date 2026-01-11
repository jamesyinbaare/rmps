"""Service for calculating registration pricing for private candidates."""

from decimal import Decimal
from typing import Any

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    RegistrationCandidate,
    SubjectPricing,
    RegistrationTieredPricing,
    RegistrationApplicationFee,
    RegistrationSubjectSelection,
    RegistrationExam,
)


async def get_application_fee(session: AsyncSession, exam_id: int | None = None) -> Decimal:
    """
    Get application fee for an exam.

    Args:
        session: Database session
        exam_id: Exam ID (None for global fee)

    Returns:
        Application fee as Decimal (0 if not found)
    """
    # Try exam-specific first
    if exam_id:
        stmt = select(RegistrationApplicationFee).where(
            and_(
                RegistrationApplicationFee.exam_id == exam_id,
                RegistrationApplicationFee.is_active == True
            )
        )
        result = await session.execute(stmt)
        fee = result.scalar_one_or_none()
        if fee:
            return Decimal(str(fee.fee))

    # Fallback to global
    stmt = select(RegistrationApplicationFee).where(
        and_(
            RegistrationApplicationFee.exam_id.is_(None),
            RegistrationApplicationFee.is_active == True
        )
    )
    result = await session.execute(stmt)
    fee = result.scalar_one_or_none()
    if fee:
        return Decimal(str(fee.fee))

    return Decimal("0")


async def get_subject_prices(
    session: AsyncSession, subject_ids: list[int], exam_id: int | None = None
) -> dict[int, Decimal]:
    """
    Get prices for subjects.

    Args:
        session: Database session
        subject_ids: List of subject IDs
        exam_id: Exam ID (None for global pricing)

    Returns:
        Dictionary mapping subject_id to price
    """
    if not subject_ids:
        return {}

    prices: dict[int, Decimal] = {}

    # Get exam-specific prices first
    if exam_id:
        stmt = select(SubjectPricing).where(
            and_(
                SubjectPricing.subject_id.in_(subject_ids),
                SubjectPricing.exam_id == exam_id,
                SubjectPricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        exam_prices = result.scalars().all()
        for pricing in exam_prices:
            prices[pricing.subject_id] = Decimal(str(pricing.price))

    # Get global prices for subjects not found in exam-specific
    missing_subject_ids = [sid for sid in subject_ids if sid not in prices]
    if missing_subject_ids:
        stmt = select(SubjectPricing).where(
            and_(
                SubjectPricing.subject_id.in_(missing_subject_ids),
                SubjectPricing.exam_id.is_(None),
                SubjectPricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        global_prices = result.scalars().all()
        for pricing in global_prices:
            if pricing.subject_id not in prices:
                prices[pricing.subject_id] = Decimal(str(pricing.price))

    return prices


async def get_tiered_pricing(
    session: AsyncSession, subject_count: int, exam_id: int | None = None
) -> Decimal | None:
    """
    Get tiered pricing for a number of subjects.

    Args:
        session: Database session
        subject_count: Number of subjects
        exam_id: Exam ID (None for global pricing)

    Returns:
        Tiered price as Decimal, or None if no matching tier found
    """
    # Try exam-specific first
    if exam_id:
        stmt = select(RegistrationTieredPricing).where(
            and_(
                RegistrationTieredPricing.exam_id == exam_id,
                RegistrationTieredPricing.is_active == True,
                RegistrationTieredPricing.min_subjects <= subject_count,
                or_(
                    RegistrationTieredPricing.max_subjects.is_(None),
                    RegistrationTieredPricing.max_subjects >= subject_count
                )
            )
        ).order_by(RegistrationTieredPricing.min_subjects.desc())
        result = await session.execute(stmt)
        tier = result.scalar_one_or_none()
        if tier:
            return Decimal(str(tier.price))

    # Fallback to global
    stmt = select(RegistrationTieredPricing).where(
        and_(
            RegistrationTieredPricing.exam_id.is_(None),
            RegistrationTieredPricing.is_active == True,
            RegistrationTieredPricing.min_subjects <= subject_count,
            or_(
                RegistrationTieredPricing.max_subjects.is_(None),
                RegistrationTieredPricing.max_subjects >= subject_count
            )
        )
    ).order_by(RegistrationTieredPricing.min_subjects.desc())
    result = await session.execute(stmt)
    tier = result.scalar_one_or_none()
    if tier:
        return Decimal(str(tier.price))

    return None


async def calculate_registration_amount(
    session: AsyncSession,
    candidate_id: int,
    pricing_model: str | None = None,
    include_application_fee: bool = True,
) -> dict[str, Any]:
    """
    Calculate total registration amount for a candidate.

    Args:
        session: Database session
        candidate_id: Registration candidate ID
        pricing_model: "per_subject", "tiered", or "auto"
        include_application_fee: Whether to include application fee

    Returns:
        Dictionary with breakdown: {
            "application_fee": Decimal,
            "subject_price": Decimal | None,
            "tiered_price": Decimal | None,
            "total": Decimal,
            "pricing_model_used": str
        }
    """
    # Get candidate with exam and subject selections
    stmt = (
        select(RegistrationCandidate)
        .where(RegistrationCandidate.id == candidate_id)
        .options(
            selectinload(RegistrationCandidate.exam),
            selectinload(RegistrationCandidate.subject_selections)
        )
    )
    result = await session.execute(stmt)
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise ValueError(f"Candidate {candidate_id} not found")

    exam_id = candidate.registration_exam_id

    # Get exam to check pricing model preference
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    # Use exam's pricing model preference if not explicitly provided
    if pricing_model is None and exam and exam.pricing_model_preference:
        pricing_model = exam.pricing_model_preference
    elif pricing_model is None:
        pricing_model = "auto"

    # Get application fee
    application_fee = Decimal("0")
    if include_application_fee:
        application_fee = await get_application_fee(session, exam_id)

    # Get subject IDs
    subject_ids = [
        sel.subject_id for sel in candidate.subject_selections
        if sel.subject_id is not None
    ]
    subject_count = len(subject_ids)

    # Check if pricing is configured for this exam
    has_pricing = False
    subject_price: Decimal | None = None
    tiered_price: Decimal | None = None

    if pricing_model == "per_subject":
        prices = await get_subject_prices(session, subject_ids, exam_id)
        has_pricing = len(prices) > 0
        if has_pricing:
            subject_price = sum(prices.values())
    elif pricing_model == "tiered":
        tiered_price = await get_tiered_pricing(session, subject_count, exam_id)
        has_pricing = tiered_price is not None
        if not has_pricing:
            # Fallback to per-subject if no tier found
            prices = await get_subject_prices(session, subject_ids, exam_id)
            if len(prices) > 0:
                subject_price = sum(prices.values())
                has_pricing = True
                pricing_model = "per_subject"
    else:  # auto
        # Try tiered first
        tiered_price = await get_tiered_pricing(session, subject_count, exam_id)
        if tiered_price is not None:
            has_pricing = True
            pricing_model = "tiered"
        else:
            # Fallback to per-subject
            prices = await get_subject_prices(session, subject_ids, exam_id)
            if len(prices) > 0:
                subject_price = sum(prices.values())
                has_pricing = True
                pricing_model = "per_subject"

    pricing_model_used = pricing_model

    # Calculate total
    subject_or_tiered = tiered_price if tiered_price is not None else (subject_price or Decimal("0"))
    total = application_fee + subject_or_tiered

    return {
        "application_fee": application_fee,
        "subject_price": subject_price,
        "tiered_price": tiered_price,
        "total": total,
        "pricing_model_used": pricing_model_used,
        "has_pricing": has_pricing,
    }


async def calculate_price_difference(
    session: AsyncSession, candidate_id: int, new_subject_ids: list[int]
) -> dict[str, Any]:
    """
    Calculate price difference after subject changes.

    Args:
        session: Database session
        candidate_id: Registration candidate ID
        new_subject_ids: New list of subject IDs

    Returns:
        Dictionary with: {
            "new_total": Decimal,
            "difference": Decimal,
            "requires_additional_payment": bool
        }
    """
    # Get candidate
    stmt = select(RegistrationCandidate).where(RegistrationCandidate.id == candidate_id)
    result = await session.execute(stmt)
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise ValueError(f"Candidate {candidate_id} not found")

    # Get current paid amount
    total_paid = Decimal(str(candidate.total_paid_amount or 0))

    # Temporarily update subject selections to calculate new price
    # We'll use a temporary approach: create a mock candidate calculation
    # Actually, we need to calculate with the new subjects
    # Let's get the exam_id first
    exam_id = candidate.registration_exam_id

    # Calculate new total
    # Get application fee
    application_fee = await get_application_fee(session, exam_id)

    # Calculate subject/tiered pricing with new subjects
    subject_count = len(new_subject_ids)

    # Try tiered first (auto mode)
    tiered_price = await get_tiered_pricing(session, subject_count, exam_id)
    if tiered_price is not None:
        new_total = application_fee + tiered_price
    else:
        # Fallback to per-subject
        prices = await get_subject_prices(session, new_subject_ids, exam_id)
        subject_price = sum(prices.values())
        new_total = application_fee + subject_price

    # Calculate difference
    difference = new_total - total_paid
    requires_additional_payment = difference > 0

    return {
        "new_total": new_total,
        "difference": difference,
        "requires_additional_payment": requires_additional_payment,
    }


async def requires_payment(session: AsyncSession, exam_id: int) -> bool:
    """
    Check if exam requires payment.

    For private candidates, payment is always required (both NOV/DEC and MAY/JUNE).

    Args:
        session: Database session
        exam_id: Exam ID

    Returns:
        True (payment always required for private candidates)
    """
    return True
