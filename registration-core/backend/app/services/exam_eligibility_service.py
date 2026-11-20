"""Per-exam school eligibility (strict opt-in allow-list)."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExamEligibleSchool, RegistrationExam, School


async def replace_exam_eligible_schools(
    session: AsyncSession,
    exam: RegistrationExam,
    school_ids: list[int],
    free_tvet_school_ids: list[int] | None = None,
) -> None:
    """Replace eligibility rows for an exam. Free TVET set must be a subset of school_ids."""
    if exam.id is None:
        await session.flush()

    unique_ids = sorted({int(sid) for sid in school_ids})
    free_tvet_ids = sorted({int(sid) for sid in (free_tvet_school_ids or [])})

    extra_free = set(free_tvet_ids) - set(unique_ids)
    if extra_free:
        raise ValueError(
            f"Free TVET school ids must be eligible for the exam: {sorted(extra_free)}"
        )

    if unique_ids:
        existing = (
            await session.execute(select(School.id).where(School.id.in_(unique_ids)))
        ).scalars().all()
        missing = set(unique_ids) - set(existing)
        if missing:
            raise ValueError(f"Unknown school ids: {sorted(missing)}")

    await session.execute(delete(ExamEligibleSchool).where(ExamEligibleSchool.exam_id == exam.id))
    await session.flush()
    free_set = set(free_tvet_ids)
    for school_id in unique_ids:
        session.add(
            ExamEligibleSchool(
                exam_id=exam.id,
                school_id=school_id,
                allows_free_tvet=school_id in free_set,
            )
        )


async def get_eligible_school_ids(session: AsyncSession, exam_id: int) -> list[int]:
    result = await session.execute(
        select(ExamEligibleSchool.school_id)
        .where(ExamEligibleSchool.exam_id == exam_id)
        .order_by(ExamEligibleSchool.school_id)
    )
    return list(result.scalars().all())


async def get_exam_eligible_rows(
    session: AsyncSession, exam_id: int
) -> list[ExamEligibleSchool]:
    result = await session.execute(
        select(ExamEligibleSchool)
        .where(ExamEligibleSchool.exam_id == exam_id)
        .order_by(ExamEligibleSchool.school_id)
    )
    return list(result.scalars().all())


async def count_eligible_schools(session: AsyncSession, exam_id: int) -> int:
    from sqlalchemy import func

    result = await session.execute(
        select(func.count(ExamEligibleSchool.id)).where(ExamEligibleSchool.exam_id == exam_id)
    )
    return int(result.scalar() or 0)


async def is_school_eligible_for_exam(session: AsyncSession, exam_id: int, school_id: int | None) -> bool:
    """Strict opt-in: school must appear in exam_eligible_schools."""
    if school_id is None:
        return False
    result = await session.execute(
        select(ExamEligibleSchool.id).where(
            ExamEligibleSchool.exam_id == exam_id,
            ExamEligibleSchool.school_id == school_id,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def school_allows_free_tvet_for_exam(
    session: AsyncSession, exam_id: int, school_id: int | None
) -> bool:
    """Whether this school may register free_tvet candidates for the exam."""
    if school_id is None:
        return False
    result = await session.execute(
        select(ExamEligibleSchool.allows_free_tvet).where(
            ExamEligibleSchool.exam_id == exam_id,
            ExamEligibleSchool.school_id == school_id,
        ).limit(1)
    )
    value = result.scalar_one_or_none()
    return bool(value)
