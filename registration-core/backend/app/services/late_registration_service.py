"""Late registration windows — grant temporary school registration after the main period."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExamEligibleSchool,
    ExamLateRegistrationWindow,
    ExamLateRegistrationWindowSchool,
    RegistrationExam,
    School,
)
from app.services.exam_eligibility_service import is_school_eligible_for_exam


def is_main_registration_period_open(exam: RegistrationExam, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    period = exam.registration_period
    return bool(
        period.is_active
        and period.registration_start_date <= now
        and period.registration_end_date >= now
    )


async def active_late_window_covers_school(
    session: AsyncSession,
    exam_id: int,
    school_id: int,
    now: datetime | None = None,
) -> bool:
    """True if an active late window covers this school (all-eligible or explicit list)."""
    now = now or datetime.utcnow()

    windows = (
        await session.execute(
            select(ExamLateRegistrationWindow)
            .where(
                ExamLateRegistrationWindow.exam_id == exam_id,
                ExamLateRegistrationWindow.is_active.is_(True),
                ExamLateRegistrationWindow.starts_at <= now,
                ExamLateRegistrationWindow.ends_at >= now,
            )
            .options(selectinload(ExamLateRegistrationWindow.schools))
        )
    ).scalars().all()

    if not windows:
        return False

    for window in windows:
        school_ids = [row.school_id for row in (window.schools or [])]
        if not school_ids:
            # Empty set = all eligible schools
            if await is_school_eligible_for_exam(session, exam_id, school_id):
                return True
        elif school_id in school_ids:
            if await is_school_eligible_for_exam(session, exam_id, school_id):
                return True
    return False


async def is_registration_open_for_school(
    session: AsyncSession,
    exam: RegistrationExam,
    school_id: int | None,
    now: datetime | None = None,
) -> bool:
    """Main period open OR active late window covers the school. Eligibility is caller's concern for list filters."""
    now = now or datetime.utcnow()
    if is_main_registration_period_open(exam, now):
        return True
    if school_id is None:
        return False
    return await active_late_window_covers_school(session, exam.id, school_id, now)


async def list_late_windows(session: AsyncSession, exam_id: int) -> list[ExamLateRegistrationWindow]:
    result = await session.execute(
        select(ExamLateRegistrationWindow)
        .where(ExamLateRegistrationWindow.exam_id == exam_id)
        .options(
            selectinload(ExamLateRegistrationWindow.schools).selectinload(
                ExamLateRegistrationWindowSchool.school
            )
        )
        .order_by(ExamLateRegistrationWindow.created_at.desc())
    )
    return list(result.scalars().unique().all())


async def create_late_window(
    session: AsyncSession,
    exam: RegistrationExam,
    *,
    starts_at: datetime,
    ends_at: datetime,
    school_ids: list[int] | None,
    note: str | None,
    created_by_user_id: UUID | None,
) -> ExamLateRegistrationWindow:
    if ends_at <= starts_at:
        raise ValueError("ends_at must be after starts_at")

    unique_ids: list[int] = []
    if school_ids:
        unique_ids = sorted({int(sid) for sid in school_ids})
        existing = (
            await session.execute(select(School.id).where(School.id.in_(unique_ids)))
        ).scalars().all()
        missing = set(unique_ids) - set(existing)
        if missing:
            raise ValueError(f"Unknown school ids: {sorted(missing)}")

        eligible = set(
            (
                await session.execute(
                    select(ExamEligibleSchool.school_id).where(
                        ExamEligibleSchool.exam_id == exam.id,
                        ExamEligibleSchool.school_id.in_(unique_ids),
                    )
                )
            ).scalars().all()
        )
        not_eligible = set(unique_ids) - eligible
        if not_eligible:
            raise ValueError(
                f"Schools not eligible for this examination: {sorted(not_eligible)}"
            )

    window = ExamLateRegistrationWindow(
        exam_id=exam.id,
        starts_at=starts_at,
        ends_at=ends_at,
        is_active=True,
        note=note,
        created_by_user_id=created_by_user_id,
    )
    session.add(window)
    await session.flush()

    for school_id in unique_ids:
        session.add(ExamLateRegistrationWindowSchool(window_id=window.id, school_id=school_id))

    await session.flush()
    return (
        await session.execute(
            select(ExamLateRegistrationWindow)
            .where(ExamLateRegistrationWindow.id == window.id)
            .options(
                selectinload(ExamLateRegistrationWindow.schools).selectinload(
                    ExamLateRegistrationWindowSchool.school
                )
            )
        )
    ).scalar_one()


async def revoke_late_window(
    session: AsyncSession, exam_id: int, window_id: int
) -> ExamLateRegistrationWindow:
    window = (
        await session.execute(
            select(ExamLateRegistrationWindow)
            .where(
                ExamLateRegistrationWindow.id == window_id,
                ExamLateRegistrationWindow.exam_id == exam_id,
            )
            .options(
                selectinload(ExamLateRegistrationWindow.schools).selectinload(
                    ExamLateRegistrationWindowSchool.school
                )
            )
        )
    ).scalar_one_or_none()
    if not window:
        raise LookupError("Late registration window not found")
    window.is_active = False
    await session.flush()
    return window


async def exam_ids_with_active_late_window_for_school(
    session: AsyncSession, school_id: int, now: datetime | None = None
) -> set[int]:
    """Exam IDs where this school has an active covering late window (for list filters)."""
    now = now or datetime.utcnow()

    # Explicit school membership
    explicit = set(
        (
            await session.execute(
                select(ExamLateRegistrationWindow.exam_id)
                .join(
                    ExamLateRegistrationWindowSchool,
                    ExamLateRegistrationWindowSchool.window_id == ExamLateRegistrationWindow.id,
                )
                .where(
                    ExamLateRegistrationWindow.is_active.is_(True),
                    ExamLateRegistrationWindow.starts_at <= now,
                    ExamLateRegistrationWindow.ends_at >= now,
                    ExamLateRegistrationWindowSchool.school_id == school_id,
                )
            )
        ).scalars().all()
    )

    # All-eligible windows (no school rows) where school is eligible
    all_scope_windows = (
        await session.execute(
            select(ExamLateRegistrationWindow)
            .where(
                ExamLateRegistrationWindow.is_active.is_(True),
                ExamLateRegistrationWindow.starts_at <= now,
                ExamLateRegistrationWindow.ends_at >= now,
            )
            .options(selectinload(ExamLateRegistrationWindow.schools))
        )
    ).scalars().unique().all()

    all_scope_exam_ids: set[int] = set()
    for window in all_scope_windows:
        if window.schools:
            continue
        if await is_school_eligible_for_exam(session, window.exam_id, school_id):
            all_scope_exam_ids.add(window.exam_id)

    return explicit | all_scope_exam_ids
