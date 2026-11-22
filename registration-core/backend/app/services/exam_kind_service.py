"""Exam kind helpers: school vs private examination rules."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExamKind, RegistrationExam, RegistrationType, School


def parse_exam_kind(value: str | ExamKind | None) -> ExamKind:
    if value is None:
        return ExamKind.SCHOOL
    if isinstance(value, ExamKind):
        return value
    try:
        return ExamKind(str(value).strip().lower())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="exam_kind must be 'school' or 'private'",
        ) from exc


def exam_kind_value(exam: RegistrationExam) -> ExamKind:
    kind = getattr(exam, "exam_kind", None)
    if kind is None:
        period = getattr(exam, "registration_period", None)
        if period is not None and getattr(period, "allows_private_registration", False) and not getattr(
            period, "allows_bulk_registration", True
        ):
            return ExamKind.PRIVATE
        return ExamKind.SCHOOL
    if isinstance(kind, ExamKind):
        return kind
    return parse_exam_kind(kind)


def is_school_exam(exam: RegistrationExam) -> bool:
    return exam_kind_value(exam) == ExamKind.SCHOOL


def is_private_exam(exam: RegistrationExam) -> bool:
    return exam_kind_value(exam) == ExamKind.PRIVATE


def allows_referral(exam: RegistrationExam) -> bool:
    if not is_school_exam(exam):
        return False
    return bool(getattr(exam, "allows_referral_registration", True))


def sync_period_private_flag(exam: RegistrationExam) -> None:
    """Keep allows_private_registration aligned with exam_kind."""
    period = getattr(exam, "registration_period", None)
    if period is None:
        return
    period.allows_private_registration = is_private_exam(exam)


def normalize_exam_kind_flags(
    exam_kind: ExamKind,
    allows_referral_registration: bool | None,
) -> tuple[ExamKind, bool, bool]:
    """
    Return (exam_kind, allows_referral_registration, allows_private_registration).
    Referral is forced off for private exams.
    """
    allows_private = exam_kind == ExamKind.PRIVATE
    if exam_kind == ExamKind.PRIVATE:
        referral = False
    else:
        referral = True if allows_referral_registration is None else bool(allows_referral_registration)
    return exam_kind, referral, allows_private


def allowed_registration_types_for_school_exam(
    exam: RegistrationExam,
    *,
    allows_free_tvet: bool,
) -> list[str]:
    """
    Free TVET schools: free_tvet + fee_paying (+ referral if enabled).
    Non–Free TVET schools: fee_paying (+ referral if enabled).
    """
    if is_private_exam(exam):
        return [RegistrationType.PRIVATE.value]
    types: list[str] = []
    if allows_free_tvet:
        types.append(RegistrationType.FREE_TVET.value)
    types.append(RegistrationType.FEE_PAYING.value)
    if allows_referral(exam):
        types.append(RegistrationType.REFERRAL.value)
    return types


def allowed_registration_types_for_exam(exam: RegistrationExam) -> list[str]:
    """Exam-level types without school Free TVET context (admin listing)."""
    if is_private_exam(exam):
        return [RegistrationType.PRIVATE.value]
    types = [RegistrationType.FEE_PAYING.value, RegistrationType.FREE_TVET.value]
    if allows_referral(exam):
        types.append(RegistrationType.REFERRAL.value)
    return types


def validate_registration_type_for_exam(
    exam: RegistrationExam,
    registration_type: str | None,
    *,
    is_school_registration: bool,
    allows_free_tvet: bool | None = None,
) -> str:
    """
    Validate and return the canonical registration_type string for this exam.

    School exams (with school Free TVET flag):
    - allows_free_tvet True  -> free_tvet (default), fee_paying, referral if enabled
    - allows_free_tvet False -> fee_paying (default), referral if enabled; reject free_tvet
    - allows_free_tvet None  -> accept fee_paying/free_tvet/referral when otherwise valid (admin import)
    Private exams: private only.
    """
    kind = exam_kind_value(exam)

    if kind == ExamKind.PRIVATE:
        resolved = registration_type or RegistrationType.PRIVATE.value
        if resolved != RegistrationType.PRIVATE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Private examinations only accept registration_type 'private'",
            )
        return resolved

    # School examination — resolve default from Free TVET eligibility when known
    if registration_type is None:
        if allows_free_tvet is True:
            resolved = RegistrationType.FREE_TVET.value
        else:
            resolved = RegistrationType.FEE_PAYING.value
    else:
        resolved = registration_type

    if resolved == RegistrationType.PRIVATE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="School examinations do not accept private candidate registration",
        )

    if resolved == RegistrationType.REFERRAL.value:
        if not allows_referral(exam):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Referral registration is not allowed for this examination",
            )
        return resolved

    if resolved == RegistrationType.FREE_TVET.value:
        if allows_free_tvet is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "This school is not Free TVET–eligible for this examination. "
                    "Use registration_type 'fee_paying' or 'referral'."
                ),
            )
        return resolved

    if resolved == RegistrationType.FEE_PAYING.value:
        # Fee-paying is allowed for both Free TVET and non–Free TVET schools
        return resolved

    allowed = (
        allowed_registration_types_for_school_exam(exam, allows_free_tvet=bool(allows_free_tvet))
        if allows_free_tvet is not None
        else allowed_registration_types_for_exam(exam)
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            f"Invalid registration_type '{resolved}'. "
            f"Allowed for this examination: {', '.join(allowed)}"
        ),
    )


async def resolve_examination_center(
    session: AsyncSession,
    *,
    school_id: int | None,
    registering_school_id: int | None = None,
    require_center: bool = True,
) -> School:
    """
    Resolve examination center for private exam registration.

    Defaults to registering_school_id when school_id is omitted.
    Center must be an active private examination center.
    """
    center_id = school_id if school_id is not None else registering_school_id
    if center_id is None:
        if require_center:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Examination center (school_id) is required for private examination registration",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="school_id is required")

    result = await session.execute(select(School).where(School.id == center_id))
    center = result.scalar_one_or_none()
    if not center or not center.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected examination center not found or inactive",
        )
    if not center.is_private_examination_center:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected school is not available as an examination center for private candidates",
        )
    return center


def assert_private_portal_allowed(exam: RegistrationExam) -> None:
    if not is_private_exam(exam):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This examination does not allow private (individual) registration",
        )
    period = exam.registration_period
    if period and not period.allows_private_registration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This examination does not allow private registration",
        )
