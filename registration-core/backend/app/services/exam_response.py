"""Build RegistrationExamResponse payloads with taxonomy fields."""

from __future__ import annotations

from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import RegistrationExam
from app.schemas.registration import ExamRegistrationPeriodResponse, RegistrationExamResponse


def serialize_exam(
    exam: RegistrationExam,
    *,
    candidate_count: int | None = None,
    approved_candidates: int | None = None,
    has_index_numbers: bool = False,
    eligible_school_count: int | None = None,
    allows_free_tvet: bool | None = None,
    expected_total: int | None = None,
) -> RegistrationExamResponse:
    enabled_ids = [e.programme_type_id for e in (exam.enabled_programme_types or [])]
    if eligible_school_count is None:
        state = sa_inspect(exam)
        if "eligible_schools" not in state.unloaded:
            eligible_school_count = len(exam.eligible_schools or [])
    return RegistrationExamResponse(
        id=exam.id,
        exam_id_main_system=exam.exam_id_main_system,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        programme_type_id=exam.programme_type_id,
        exam_series_id=exam.exam_series_id,
        programme_type_name=exam.programme_type.name if exam.programme_type else None,
        exam_series_short_name=exam.series_definition.short_name if exam.series_definition else exam.exam_series,
        exam_series_long_name=exam.series_definition.long_name if exam.series_definition else None,
        enabled_programme_type_ids=enabled_ids,
        year=exam.year,
        description=exam.description,
        exam_kind=exam.exam_kind.value if hasattr(exam.exam_kind, "value") else str(exam.exam_kind),
        allows_referral_registration=bool(exam.allows_referral_registration),
        requires_completion_confirmation=bool(
            getattr(exam, "requires_completion_confirmation", False)
        ),
        allows_free_tvet=allows_free_tvet,
        registration_period=ExamRegistrationPeriodResponse.model_validate(exam.registration_period),
        results_published=exam.results_published,
        results_published_at=exam.results_published_at,
        results_published_by_user_id=str(exam.results_published_by_user_id)
        if exam.results_published_by_user_id
        else None,
        pricing_model_preference=exam.pricing_model_preference,
        has_index_numbers=has_index_numbers,
        candidate_count=candidate_count,
        approved_candidates=approved_candidates,
        eligible_school_count=eligible_school_count,
        expected_total=expected_total,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
    )


def exam_load_options():
    return [
        selectinload(RegistrationExam.registration_period),
        selectinload(RegistrationExam.programme_type),
        selectinload(RegistrationExam.series_definition),
        selectinload(RegistrationExam.enabled_programme_types),
        selectinload(RegistrationExam.eligible_schools),
    ]


async def load_exams_query(session: AsyncSession):
    stmt = (
        select(RegistrationExam)
        .options(*exam_load_options())
        .order_by(RegistrationExam.year.desc(), RegistrationExam.exam_type, RegistrationExam.exam_series)
    )
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())
