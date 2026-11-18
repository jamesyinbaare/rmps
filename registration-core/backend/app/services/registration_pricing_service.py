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
    ProgrammePricing,
    RegistrationType,
    ExamPricingModel,
)


async def get_application_fee(
    session: AsyncSession,
    exam_id: int | None = None,
    registration_type: str | None = None
) -> Decimal:
    """
    Get application fee for an exam and registration type.

    Args:
        session: Database session
        exam_id: Exam ID (None for global fee)
        registration_type: Registration type (free_tvet, private, referral) or None for all types

    Returns:
        Application fee as Decimal (0 if not found)
    """
    # Try exam-specific with registration_type first
    if exam_id and registration_type:
        stmt = select(RegistrationApplicationFee).where(
            and_(
                RegistrationApplicationFee.exam_id == exam_id,
                RegistrationApplicationFee.registration_type == registration_type,
                RegistrationApplicationFee.is_active == True
            )
        )
        result = await session.execute(stmt)
        fee = result.scalar_one_or_none()
        if fee:
            return Decimal(str(fee.fee))

    # Try exam-specific with NULL registration_type (applies to all)
    if exam_id:
        stmt = select(RegistrationApplicationFee).where(
            and_(
                RegistrationApplicationFee.exam_id == exam_id,
                RegistrationApplicationFee.registration_type.is_(None),
                RegistrationApplicationFee.is_active == True
            )
        )
        result = await session.execute(stmt)
        fee = result.scalar_one_or_none()
        if fee:
            return Decimal(str(fee.fee))

    # Fallback to global with registration_type
    if registration_type:
        stmt = select(RegistrationApplicationFee).where(
            and_(
                RegistrationApplicationFee.exam_id.is_(None),
                RegistrationApplicationFee.registration_type == registration_type,
                RegistrationApplicationFee.is_active == True
            )
        )
        result = await session.execute(stmt)
        fee = result.scalar_one_or_none()
        if fee:
            return Decimal(str(fee.fee))

    # Fallback to global with NULL registration_type
    stmt = select(RegistrationApplicationFee).where(
        and_(
            RegistrationApplicationFee.exam_id.is_(None),
            RegistrationApplicationFee.registration_type.is_(None),
            RegistrationApplicationFee.is_active == True
        )
    )
    result = await session.execute(stmt)
    fee = result.scalar_one_or_none()
    if fee:
        return Decimal(str(fee.fee))

    return Decimal("0")


async def get_subject_prices(
    session: AsyncSession,
    subject_ids: list[int],
    exam_id: int | None = None,
    registration_type: str | None = None
) -> dict[int, Decimal]:
    """
    Get prices for subjects.

    Args:
        session: Database session
        subject_ids: List of subject IDs
        exam_id: Exam ID (None for global pricing)
        registration_type: Registration type (free_tvet, private, referral) or None for all types

    Returns:
        Dictionary mapping subject_id to price
    """
    if not subject_ids:
        return {}

    prices: dict[int, Decimal] = {}

    # Get exam-specific prices with registration_type first
    if exam_id and registration_type:
        stmt = select(SubjectPricing).where(
            and_(
                SubjectPricing.subject_id.in_(subject_ids),
                SubjectPricing.exam_id == exam_id,
                SubjectPricing.registration_type == registration_type,
                SubjectPricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        exam_prices = result.scalars().all()
        for pricing in exam_prices:
            prices[pricing.subject_id] = Decimal(str(pricing.price))

    # Get exam-specific prices with NULL registration_type (applies to all)
    missing_subject_ids = [sid for sid in subject_ids if sid not in prices]
    if exam_id and missing_subject_ids:
        stmt = select(SubjectPricing).where(
            and_(
                SubjectPricing.subject_id.in_(missing_subject_ids),
                SubjectPricing.exam_id == exam_id,
                SubjectPricing.registration_type.is_(None),
                SubjectPricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        exam_prices = result.scalars().all()
        for pricing in exam_prices:
            if pricing.subject_id not in prices:
                prices[pricing.subject_id] = Decimal(str(pricing.price))

    # Get global prices with registration_type for subjects not found
    missing_subject_ids = [sid for sid in subject_ids if sid not in prices]
    if missing_subject_ids and registration_type:
        stmt = select(SubjectPricing).where(
            and_(
                SubjectPricing.subject_id.in_(missing_subject_ids),
                SubjectPricing.exam_id.is_(None),
                SubjectPricing.registration_type == registration_type,
                SubjectPricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        global_prices = result.scalars().all()
        for pricing in global_prices:
            if pricing.subject_id not in prices:
                prices[pricing.subject_id] = Decimal(str(pricing.price))

    # Get global prices with NULL registration_type for subjects not found
    missing_subject_ids = [sid for sid in subject_ids if sid not in prices]
    if missing_subject_ids:
        stmt = select(SubjectPricing).where(
            and_(
                SubjectPricing.subject_id.in_(missing_subject_ids),
                SubjectPricing.exam_id.is_(None),
                SubjectPricing.registration_type.is_(None),
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
    session: AsyncSession,
    subject_count: int,
    exam_id: int | None = None,
    registration_type: str | None = None
) -> Decimal | None:
    """
    Get tiered pricing for a number of subjects.

    Args:
        session: Database session
        subject_count: Number of subjects
        exam_id: Exam ID (None for global pricing)
        registration_type: Registration type (free_tvet, private, referral) or None for all types

    Returns:
        Tiered price as Decimal, or None if no matching tier found
    """
    # Try exam-specific with registration_type first
    if exam_id and registration_type:
        stmt = select(RegistrationTieredPricing).where(
            and_(
                RegistrationTieredPricing.exam_id == exam_id,
                RegistrationTieredPricing.registration_type == registration_type,
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

    # Try exam-specific with NULL registration_type (applies to all)
    if exam_id:
        stmt = select(RegistrationTieredPricing).where(
            and_(
                RegistrationTieredPricing.exam_id == exam_id,
                RegistrationTieredPricing.registration_type.is_(None),
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

    # Fallback to global with registration_type
    if registration_type:
        stmt = select(RegistrationTieredPricing).where(
            and_(
                RegistrationTieredPricing.exam_id.is_(None),
                RegistrationTieredPricing.registration_type == registration_type,
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

    # Fallback to global with NULL registration_type
    stmt = select(RegistrationTieredPricing).where(
        and_(
            RegistrationTieredPricing.exam_id.is_(None),
            RegistrationTieredPricing.registration_type.is_(None),
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


async def get_programme_price(
    session: AsyncSession,
    programme_id: int | None,
    exam_id: int | None = None,
    registration_type: str | None = None
) -> Decimal | None:
    """
    Get price for a programme.

    Args:
        session: Database session
        programme_id: Programme ID
        exam_id: Exam ID (None for global pricing)
        registration_type: Registration type (free_tvet, private, referral) or None for all types

    Returns:
        Programme price as Decimal, or None if no pricing found
    """
    if not programme_id:
        return None

    # Try exam-specific with registration_type first
    if exam_id and registration_type:
        stmt = select(ProgrammePricing).where(
            and_(
                ProgrammePricing.programme_id == programme_id,
                ProgrammePricing.exam_id == exam_id,
                ProgrammePricing.registration_type == registration_type,
                ProgrammePricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        pricing = result.scalar_one_or_none()
        if pricing:
            return Decimal(str(pricing.price))

    # Try exam-specific with NULL registration_type (applies to all)
    if exam_id:
        stmt = select(ProgrammePricing).where(
            and_(
                ProgrammePricing.programme_id == programme_id,
                ProgrammePricing.exam_id == exam_id,
                ProgrammePricing.registration_type.is_(None),
                ProgrammePricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        pricing = result.scalar_one_or_none()
        if pricing:
            return Decimal(str(pricing.price))

    # Fallback to global with registration_type
    if registration_type:
        stmt = select(ProgrammePricing).where(
            and_(
                ProgrammePricing.programme_id == programme_id,
                ProgrammePricing.exam_id.is_(None),
                ProgrammePricing.registration_type == registration_type,
                ProgrammePricing.is_active == True
            )
        )
        result = await session.execute(stmt)
        pricing = result.scalar_one_or_none()
        if pricing:
            return Decimal(str(pricing.price))

    # Fallback to global with NULL registration_type
    stmt = select(ProgrammePricing).where(
        and_(
            ProgrammePricing.programme_id == programme_id,
            ProgrammePricing.exam_id.is_(None),
            ProgrammePricing.registration_type.is_(None),
            ProgrammePricing.is_active == True
        )
    )
    result = await session.execute(stmt)
    pricing = result.scalar_one_or_none()
    if pricing:
        return Decimal(str(pricing.price))

    return None


async def get_pricing_model_preference(
    session: AsyncSession,
    exam_id: int | None = None,
    registration_type: str | None = None
) -> str:
    """
    Get pricing model preference for an exam and registration type.

    Args:
        session: Database session
        exam_id: Exam ID (None for global preference)
        registration_type: Registration type (free_tvet, private, referral) or None for all types

    Returns:
        Pricing model preference as string (one of "per_subject", "tiered", "per_programme")

    Raises:
        ValueError: If no explicit pricing model preference is configured
    """
    # Try exam-specific with registration_type first
    if exam_id and registration_type:
        stmt = select(ExamPricingModel).where(
            and_(
                ExamPricingModel.exam_id == exam_id,
                ExamPricingModel.registration_type == registration_type
            )
        )
        result = await session.execute(stmt)
        pricing_model = result.scalar_one_or_none()
        if pricing_model and pricing_model.pricing_model_preference != "auto":
            return pricing_model.pricing_model_preference

    # Try exam-specific with NULL registration_type (applies to all)
    if exam_id:
        stmt = select(ExamPricingModel).where(
            and_(
                ExamPricingModel.exam_id == exam_id,
                ExamPricingModel.registration_type.is_(None)
            )
        )
        result = await session.execute(stmt)
        pricing_model = result.scalar_one_or_none()
        if pricing_model and pricing_model.pricing_model_preference != "auto":
            return pricing_model.pricing_model_preference

    # Fallback to exam's default pricing_model_preference
    if exam_id:
        exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one_or_none()
        if exam and exam.pricing_model_preference and exam.pricing_model_preference != "auto":
            return exam.pricing_model_preference

    # No explicit pricing model found - raise error
    exam_info = f"exam_id={exam_id}" if exam_id else "global"
    reg_type_info = f"registration_type={registration_type}" if registration_type else "all registration types"
    raise ValueError(
        f"No explicit pricing model preference configured for {exam_info}, {reg_type_info}. "
        "Please configure an explicit pricing model (per_subject, tiered, or per_programme)."
    )


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
        pricing_model: Explicit pricing model - "per_subject", "tiered", or "per_programme"
        include_application_fee: Whether to include application fee

    Returns:
        Dictionary with breakdown: {
            "application_fee": Decimal,
            "subject_price": Decimal | None,
            "tiered_price": Decimal | None,
            "programme_price": Decimal | None,
            "total": Decimal,
            "pricing_model_used": str
        }

    Raises:
        ValueError: If pricing is not configured for the specified pricing model
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

    # Get registration type for filtering pricing
    registration_type_str = candidate.registration_type
    # Convert enum to string value if it's an enum
    if isinstance(registration_type_str, RegistrationType):
        registration_type_str = registration_type_str.value

    # Get pricing model preference for this registration type
    if pricing_model is None:
        pricing_model = await get_pricing_model_preference(session, exam_id, registration_type_str)

    # Get application fee
    application_fee = Decimal("0")
    if include_application_fee:
        registration_type_for_fee = candidate.registration_type
        # Convert enum to string value if it's an enum
        if isinstance(registration_type_for_fee, RegistrationType):
            registration_type_for_fee = registration_type_for_fee.value
        application_fee = await get_application_fee(session, exam_id, registration_type_for_fee)

    # Check if candidate is free_tvet and pricing model is per_programme
    is_free_tvet = registration_type_str == RegistrationType.FREE_TVET.value if registration_type_str else False
    programme_id = candidate.programme_id

    # Check if pricing is configured for this exam
    has_pricing = False
    subject_price: Decimal | None = None
    tiered_price: Decimal | None = None
    programme_price: Decimal | None = None

    # Get subject IDs
    subject_ids = [
        sel.subject_id for sel in candidate.subject_selections
        if sel.subject_id is not None
    ]
    subject_count = len(subject_ids)

    # Validate pricing model is explicit (not "auto")
    if pricing_model == "auto":
        raise ValueError(
            "Pricing model 'auto' is not allowed. Please configure an explicit pricing model "
            "(per_subject, tiered, or per_programme)."
        )

    # For free_tvet candidates with per_programme pricing model
    use_programme_pricing = False
    if pricing_model == "per_programme":
        if not is_free_tvet:
            raise ValueError(
                f"Per-programme pricing model is only valid for FREE TVET candidates. "
                f"Current registration type: {registration_type_str}. "
                "Please use 'per_subject' or 'tiered' pricing model instead."
            )
        programme_price = await get_programme_price(session, programme_id, exam_id, registration_type_str)
        if programme_price is None:
            raise ValueError(
                f"Per-programme pricing not configured for programme_id={programme_id}, "
                f"exam_id={exam_id}, registration_type={registration_type_str}. "
                "Please configure programme pricing or use a different pricing model."
            )
        has_pricing = True
        use_programme_pricing = True

    # For non-programme pricing, use per_subject or tiered
    if not use_programme_pricing:
        if pricing_model == "per_subject":
            prices = await get_subject_prices(session, subject_ids, exam_id, registration_type_str)
            if len(prices) == 0:
                raise ValueError(
                    f"Per-subject pricing not configured for exam_id={exam_id}, "
                    f"registration_type={registration_type_str}. "
                    "Please configure subject pricing."
                )
            subject_price = sum(prices.values())
            has_pricing = True
        elif pricing_model == "tiered":
            tiered_price = await get_tiered_pricing(session, subject_count, exam_id, registration_type_str)
            if tiered_price is None:
                raise ValueError(
                    f"Tiered pricing not configured for subject_count={subject_count}, "
                    f"exam_id={exam_id}, registration_type={registration_type_str}. "
                    "Please configure tiered pricing."
                )
            has_pricing = True
        else:
            raise ValueError(
                f"Invalid pricing model: {pricing_model}. "
                "Must be one of: per_subject, tiered, per_programme"
            )

    # Set pricing_model_used
    pricing_model_used = pricing_model

    # Calculate total
    if programme_price is not None:
        total = application_fee + programme_price
    else:
        subject_or_tiered = tiered_price if tiered_price is not None else (subject_price or Decimal("0"))
        total = application_fee + subject_or_tiered

    return {
        "application_fee": application_fee,
        "subject_price": subject_price,
        "tiered_price": tiered_price,
        "programme_price": programme_price,
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

    # Get exam_id and exam
    exam_id = candidate.registration_exam_id
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()

    # Get registration type
    registration_type_str = candidate.registration_type
    # Convert enum to string value if it's an enum
    if isinstance(registration_type_str, RegistrationType):
        registration_type_str = registration_type_str.value

    # Get pricing model preference for this registration type
    pricing_model = await get_pricing_model_preference(session, exam_id, registration_type_str)

    # Calculate new total
    # Get application fee
    application_fee = await get_application_fee(session, exam_id, registration_type_str)

    # Check if candidate is free_tvet and pricing model is per_programme
    is_free_tvet = registration_type_str == RegistrationType.FREE_TVET.value if registration_type_str else False
    programme_id = candidate.programme_id

    new_total = application_fee

    # For free_tvet candidates with per_programme pricing model
    if is_free_tvet and pricing_model == "per_programme":
        programme_price = await get_programme_price(session, programme_id, exam_id, registration_type_str)
        if programme_price is None:
            raise ValueError(
                f"Per-programme pricing not configured for programme_id={programme_id}, "
                f"exam_id={exam_id}, registration_type={registration_type_str}."
            )
        new_total += programme_price
    elif pricing_model == "per_subject":
        # Calculate per-subject pricing with new subjects
        prices = await get_subject_prices(session, new_subject_ids, exam_id, registration_type_str)
        if len(prices) == 0:
            raise ValueError(
                f"Per-subject pricing not configured for exam_id={exam_id}, "
                f"registration_type={registration_type_str}."
            )
        subject_price = sum(prices.values())
        new_total += subject_price
    elif pricing_model == "tiered":
        # Calculate tiered pricing with new subjects
        subject_count = len(new_subject_ids)
        tiered_price = await get_tiered_pricing(session, subject_count, exam_id, registration_type_str)
        if tiered_price is None:
            raise ValueError(
                f"Tiered pricing not configured for subject_count={subject_count}, "
                f"exam_id={exam_id}, registration_type={registration_type_str}."
            )
        new_total += tiered_price
    else:
        raise ValueError(
            f"Invalid pricing model: {pricing_model}. "
            "Must be one of: per_subject, tiered, per_programme"
        )

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
