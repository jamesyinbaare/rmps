"""Registration completeness: photo + fee → INCOMPLETE / COMPLETE."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    FeePaymentStatus,
    RegistrationCandidate,
    RegistrationCandidatePhoto,
    RegistrationStatus,
    RegistrationType,
)


def requires_fee(registration_type: RegistrationType | str | None) -> bool:
    """Whether this registration type must have fee paid/waived to be COMPLETE."""
    if registration_type is None:
        return True
    value = (
        registration_type.value
        if isinstance(registration_type, RegistrationType)
        else str(registration_type)
    )
    return value != RegistrationType.FREE_TVET.value


def default_fee_payment_status(
    registration_type: RegistrationType | str | None,
) -> FeePaymentStatus:
    if requires_fee(registration_type):
        return FeePaymentStatus.UNPAID
    return FeePaymentStatus.NOT_REQUIRED


def fee_is_satisfied(fee_payment_status: FeePaymentStatus | str | None) -> bool:
    if fee_payment_status is None:
        return False
    value = (
        fee_payment_status.value
        if isinstance(fee_payment_status, FeePaymentStatus)
        else str(fee_payment_status)
    )
    return value in {
        FeePaymentStatus.NOT_REQUIRED.value,
        FeePaymentStatus.PAID.value,
        FeePaymentStatus.WAIVED.value,
    }


async def candidate_has_photo(
    session: AsyncSession, candidate_id: int
) -> bool:
    result = await session.execute(
        select(RegistrationCandidatePhoto.id)
        .where(RegistrationCandidatePhoto.registration_candidate_id == candidate_id)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def recompute_registration_status(
    session: AsyncSession,
    candidate: RegistrationCandidate,
    *,
    has_photo: bool | None = None,
) -> RegistrationStatus:
    """
    Auto-maintain status from photo + fee.

    DRAFT is preserved (private wizard). Otherwise COMPLETE iff photo and fee OK.
    """
    if candidate.registration_status == RegistrationStatus.DRAFT:
        return RegistrationStatus.DRAFT

    if has_photo is None:
        has_photo = await candidate_has_photo(session, candidate.id)

    if has_photo and fee_is_satisfied(candidate.fee_payment_status):
        candidate.registration_status = RegistrationStatus.COMPLETE
    else:
        candidate.registration_status = RegistrationStatus.INCOMPLETE

    return candidate.registration_status


def apply_fee_paid(
    candidate: RegistrationCandidate,
    *,
    user_id: UUID | None = None,
    at: datetime | None = None,
) -> None:
    if not requires_fee(candidate.registration_type):
        raise ValueError(
            "Free TVET candidates do not require a registration fee"
        )
    candidate.fee_payment_status = FeePaymentStatus.PAID
    candidate.fee_paid_at = at or datetime.utcnow()
    candidate.fee_paid_by_user_id = user_id


def apply_fee_waived(
    candidate: RegistrationCandidate,
    *,
    user_id: UUID | None = None,
    at: datetime | None = None,
) -> None:
    if not requires_fee(candidate.registration_type):
        raise ValueError(
            "Free TVET candidates do not require a registration fee"
        )
    candidate.fee_payment_status = FeePaymentStatus.WAIVED
    candidate.fee_paid_at = at or datetime.utcnow()
    candidate.fee_paid_by_user_id = user_id


def apply_fee_unpaid(candidate: RegistrationCandidate) -> None:
    if not requires_fee(candidate.registration_type):
        candidate.fee_payment_status = FeePaymentStatus.NOT_REQUIRED
        candidate.fee_paid_at = None
        candidate.fee_paid_by_user_id = None
        return
    candidate.fee_payment_status = FeePaymentStatus.UNPAID
    candidate.fee_paid_at = None
    candidate.fee_paid_by_user_id = None


def incompleteness_reasons(
    *,
    has_photo: bool,
    fee_payment_status: FeePaymentStatus | str | None,
    registration_status: RegistrationStatus | str | None = None,
) -> list[str]:
    """Human-readable reasons a registration is not complete."""
    reasons: list[str] = []
    status_value = (
        registration_status.value
        if isinstance(registration_status, RegistrationStatus)
        else registration_status
    )
    if status_value == RegistrationStatus.DRAFT.value:
        reasons.append("Registration is still a draft")
        return reasons
    if not has_photo:
        reasons.append("Photo not uploaded")
    if not fee_is_satisfied(fee_payment_status):
        reasons.append("Fee not paid")
    return reasons
