"""Per-exam school eligibility (strict opt-in allow-list)."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExamEligibleSchool, RegistrationExam, School


async def replace_exam_eligible_schools(
    session: AsyncSession,
    exam: RegistrationExam,
    school_ids: list[int],
) -> None:
    """Replace eligibility rows for an exam (explicit delete; no async lazy-load)."""
    if exam.id is None:
        await session.flush()

    unique_ids = sorted({int(sid) for sid in school_ids})

    if unique_ids:
        existing = (
            await session.execute(select(School.id).where(School.id.in_(unique_ids)))
        ).scalars().all()
        missing = set(unique_ids) - set(existing)
        if missing:
            raise ValueError(f"Unknown school ids: {sorted(missing)}")

    await session.execute(delete(ExamEligibleSchool).where(ExamEligibleSchool.exam_id == exam.id))
    await session.flush()
    for school_id in unique_ids:
        session.add(ExamEligibleSchool(exam_id=exam.id, school_id=school_id))


async def get_eligible_school_ids(session: AsyncSession, exam_id: int) -> list[int]:
    result = await session.execute(
        select(ExamEligibleSchool.school_id)
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
