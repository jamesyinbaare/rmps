"""School self-declared expected registration counts for an exam."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExamEligibleSchool,
    ExamSchoolProgrammeExpectation,
    PortalUser,
    RegistrationCandidate,
    RegistrationExam,
)
from app.schemas.expectations import (
    ProgrammeExpectationProgress,
    SchoolExamExpectationsResponse,
    SchoolExamExpectationsUpdate,
)
from app.services.exam_eligibility_service import is_school_eligible_for_exam
from app.services.completion_confirmation_service import assert_registration_editable
from app.services.late_registration_service import is_registration_open_for_school
from app.services.programme_type_service import list_programmes_for_exam
from app.services.school_programme_service import ensure_school_programme


async def _get_eligibility_row(
    session: AsyncSession, exam_id: int, school_id: int
) -> ExamEligibleSchool | None:
    result = await session.execute(
        select(ExamEligibleSchool)
        .options(selectinload(ExamEligibleSchool.expected_declared_by))
        .where(
            ExamEligibleSchool.exam_id == exam_id,
            ExamEligibleSchool.school_id == school_id,
        )
    )
    return result.scalar_one_or_none()


async def _actual_counts_by_programme(
    session: AsyncSession, exam_id: int, school_id: int
) -> dict[int, int]:
    result = await session.execute(
        select(
            RegistrationCandidate.programme_id,
            func.count(RegistrationCandidate.id),
        )
        .where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id == school_id,
            RegistrationCandidate.programme_id.isnot(None),
        )
        .group_by(RegistrationCandidate.programme_id)
    )
    return {int(pid): int(count) for pid, count in result.all() if pid is not None}


async def _actual_total(session: AsyncSession, exam_id: int, school_id: int) -> int:
    result = await session.execute(
        select(func.count(RegistrationCandidate.id)).where(
            RegistrationCandidate.registration_exam_id == exam_id,
            RegistrationCandidate.school_id == school_id,
        )
    )
    return int(result.scalar() or 0)


def _declared_by_name(user: PortalUser | None) -> str | None:
    if user is None:
        return None
    if user.full_name:
        return user.full_name
    return user.email


async def get_school_exam_expectations(
    session: AsyncSession,
    exam_id: int,
    school_id: int,
) -> SchoolExamExpectationsResponse:
    if not await is_school_eligible_for_exam(session, exam_id, school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is not eligible for this examination",
        )

    exam = (
        await session.execute(
            select(RegistrationExam)
            .options(selectinload(RegistrationExam.registration_period))
            .where(RegistrationExam.id == exam_id)
        )
    ).scalar_one_or_none()
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    eligibility = await _get_eligibility_row(session, exam_id, school_id)
    # Full exam catalogue; school association is optional for expectations.
    programmes = await list_programmes_for_exam(session, exam_id=exam_id, school_id=None)
    actual_by_programme = await _actual_counts_by_programme(session, exam_id, school_id)
    actual_total = await _actual_total(session, exam_id, school_id)

    expectation_rows = (
        await session.execute(
            select(ExamSchoolProgrammeExpectation).where(
                ExamSchoolProgrammeExpectation.exam_id == exam_id,
                ExamSchoolProgrammeExpectation.school_id == school_id,
            )
        )
    ).scalars().all()
    expected_by_programme = {row.programme_id: row.expected_count for row in expectation_rows}

    expected_total = eligibility.expected_total if eligibility else None
    has_declaration = expected_total is not None or bool(expected_by_programme)

    programme_progress: list[ProgrammeExpectationProgress] = []
    for programme in programmes:
        expected_count = expected_by_programme.get(programme.id)
        actual_count = actual_by_programme.get(programme.id, 0)
        over = expected_count is not None and actual_count > expected_count
        under = expected_count is not None and actual_count < expected_count
        programme_progress.append(
            ProgrammeExpectationProgress(
                programme_id=programme.id,
                code=programme.code,
                name=programme.name,
                expected_count=expected_count,
                actual_count=actual_count,
                over=over,
                under=under,
            )
        )

    total_over = expected_total is not None and actual_total > expected_total
    total_under = expected_total is not None and actual_total < expected_total
    can_edit = await is_registration_open_for_school(session, exam, school_id)

    return SchoolExamExpectationsResponse(
        exam_id=exam_id,
        school_id=school_id,
        expected_total=expected_total,
        actual_total=actual_total,
        has_declaration=has_declaration,
        total_over=total_over,
        total_under=total_under,
        declared_at=eligibility.expected_declared_at if eligibility else None,
        declared_by_user_id=eligibility.expected_declared_by_user_id if eligibility else None,
        declared_by_name=_declared_by_name(
            eligibility.expected_declared_by if eligibility else None
        ),
        programmes=programme_progress,
        can_edit=can_edit,
    )


async def upsert_school_exam_expectations(
    session: AsyncSession,
    exam_id: int,
    school_id: int,
    payload: SchoolExamExpectationsUpdate,
    user_id: UUID,
) -> SchoolExamExpectationsResponse:
    if not await is_school_eligible_for_exam(session, exam_id, school_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is not eligible for this examination",
        )

    exam = (
        await session.execute(
            select(RegistrationExam)
            .options(selectinload(RegistrationExam.registration_period))
            .where(RegistrationExam.id == exam_id)
        )
    ).scalar_one_or_none()
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if not await is_registration_open_for_school(session, exam, school_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update expectations: registration period is not open",
        )

    await assert_registration_editable(session, exam, school_id)

    eligibility = await _get_eligibility_row(session, exam_id, school_id)
    if eligibility is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School is not eligible for this examination",
        )

    allowed_programmes = await list_programmes_for_exam(
        session, exam_id=exam_id, school_id=None
    )
    allowed_ids = {p.id for p in allowed_programmes}

    # Deduplicate by programme_id (last wins)
    programme_map: dict[int, int] = {}
    for item in payload.programmes:
        if item.programme_id not in allowed_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Programme {item.programme_id} is not available for this exam",
            )
        if item.expected_count < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Expected counts must be at least 1",
            )
        programme_map[item.programme_id] = item.expected_count

    if payload.expected_total is not None and payload.expected_total < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expected total must be at least 1",
        )

    if payload.expected_total is not None and programme_map:
        programme_sum = sum(programme_map.values())
        if programme_sum != payload.expected_total:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Sum of per-programme expected counts ({programme_sum}) "
                    f"must equal expected total ({payload.expected_total})"
                ),
            )

    for programme_id in programme_map:
        await ensure_school_programme(session, school_id, programme_id)

    clearing = payload.expected_total is None and not programme_map
    now = datetime.utcnow()

    eligibility.expected_total = payload.expected_total
    if clearing:
        eligibility.expected_declared_at = None
        eligibility.expected_declared_by_user_id = None
    else:
        eligibility.expected_declared_at = now
        eligibility.expected_declared_by_user_id = user_id

    await session.execute(
        delete(ExamSchoolProgrammeExpectation).where(
            ExamSchoolProgrammeExpectation.exam_id == exam_id,
            ExamSchoolProgrammeExpectation.school_id == school_id,
        )
    )
    for programme_id, expected_count in programme_map.items():
        session.add(
            ExamSchoolProgrammeExpectation(
                exam_id=exam_id,
                school_id=school_id,
                programme_id=programme_id,
                expected_count=expected_count,
            )
        )

    await session.commit()
    return await get_school_exam_expectations(session, exam_id, school_id)


async def get_expected_totals_for_exam_schools(
    session: AsyncSession, exam_id: int, school_ids: list[int]
) -> dict[int, int | None]:
    """Map school_id -> expected_total for admin listings."""
    if not school_ids:
        return {}
    result = await session.execute(
        select(ExamEligibleSchool.school_id, ExamEligibleSchool.expected_total).where(
            ExamEligibleSchool.exam_id == exam_id,
            ExamEligibleSchool.school_id.in_(school_ids),
        )
    )
    return {int(school_id): expected_total for school_id, expected_total in result.all()}
