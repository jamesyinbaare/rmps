from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExamInspectorSubjectScope, ExaminationCandidate
from app.schemas.examination import TimetableEntry
from app.schemas.timetable import TimetableDownloadFilter
from app.services.exam_timetable_pdf import load_schedules_for_exam, schedules_to_entries
from app.services.inspector_posting import InspectorWorkspaceContext
from app.services.timetable_service import (
    filter_schedule_codes_by_subject_type,
    get_candidate_schedule_codes_for_exam,
)


def timetable_filter_for_inspector_scope(scope: ExamInspectorSubjectScope) -> TimetableDownloadFilter:
    if scope == ExamInspectorSubjectScope.CORE:
        return TimetableDownloadFilter.CORE_ONLY
    if scope == ExamInspectorSubjectScope.ELECTIVE:
        return TimetableDownloadFilter.ELECTIVE_ONLY
    return TimetableDownloadFilter.ALL


async def staff_center_filtered_timetable_entries(
    session: AsyncSession,
    exam_id: int,
    scope_ids: set[UUID],
    *,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
) -> list[TimetableEntry]:
    """Timetable entries for centre scope (candidate-linked subjects intersect schedules)."""
    explicit_codes = await get_candidate_schedule_codes_for_exam(
        session,
        exam_id,
        scope_ids,
        programme_id=None,
        filter_school_id=None,
    )
    all_schedules = await load_schedules_for_exam(session, exam_id)
    schedule_codes = {s.subject_code for s in all_schedules}
    intersected = explicit_codes & schedule_codes
    filtered_codes = await filter_schedule_codes_by_subject_type(
        session,
        intersected,
        subject_filter,
    )
    filtered = [s for s in all_schedules if s.subject_code in filtered_codes]
    return schedules_to_entries(filtered)


async def scheduled_examination_dates_for_inspector_workspace(
    session: AsyncSession,
    examination_id: int,
    ctx: InspectorWorkspaceContext,
) -> list[date]:
    """Unique centre-wide examination dates from the timetable (past and future)."""
    subject_filter = timetable_filter_for_inspector_scope(ctx.subject_scope)
    entries = await staff_center_filtered_timetable_entries(
        session,
        examination_id,
        ctx.scope_ids,
        subject_filter=subject_filter,
    )
    unique = {e.examination_date for e in entries}
    # Newest first so recent / past days are easy to find in the upload dropdown.
    return sorted(unique, reverse=True)


async def scheduled_examination_dates_for_exam(
    session: AsyncSession,
    examination_id: int,
    *,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
) -> list[date]:
    """Exam-wide scheduled examination dates from the timetable (newest first)."""
    stmt = (
        select(ExaminationCandidate.school_id)
        .where(
            ExaminationCandidate.examination_id == examination_id,
            ExaminationCandidate.school_id.isnot(None),
        )
        .distinct()
    )
    result = await session.execute(stmt)
    scope_ids = {row[0] for row in result.all() if row[0] is not None}
    if not scope_ids:
        return []
    entries = await staff_center_filtered_timetable_entries(
        session,
        examination_id,
        scope_ids,
        subject_filter=subject_filter,
    )
    unique = {e.examination_date for e in entries}
    return sorted(unique, reverse=True)
