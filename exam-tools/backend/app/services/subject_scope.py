"""Subject scope helpers for officials (working_scope) and attendance (timetable inference)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExamInspectorSubjectScope, InspectorAttendanceSheet
from app.schemas.timetable import TimetableDownloadFilter
from app.services.inspector_posting import InspectorWorkspaceContext
from app.services.timetable_dates import staff_center_filtered_timetable_entries
from app.services.timetable_service import filter_schedule_codes_by_subject_type

RecordSubjectScope = ExamInspectorSubjectScope


def normalize_record_subject_scope(
    scope: ExamInspectorSubjectScope | str,
) -> ExamInspectorSubjectScope:
    if isinstance(scope, ExamInspectorSubjectScope):
        if scope == ExamInspectorSubjectScope.ALL:
            raise ValueError("Record subject_scope must be CORE or ELECTIVE")
        return scope
    s = str(scope).strip().upper()
    if s == ExamInspectorSubjectScope.CORE.value:
        return ExamInspectorSubjectScope.CORE
    if s == ExamInspectorSubjectScope.ELECTIVE.value:
        return ExamInspectorSubjectScope.ELECTIVE
    raise ValueError("subject_scope must be CORE or ELECTIVE")


def opposite_record_scope(scope: ExamInspectorSubjectScope) -> ExamInspectorSubjectScope:
    """CORE ↔ ELECTIVE for officials roster import/copy."""
    if scope == ExamInspectorSubjectScope.CORE:
        return ExamInspectorSubjectScope.ELECTIVE
    if scope == ExamInspectorSubjectScope.ELECTIVE:
        return ExamInspectorSubjectScope.CORE
    raise ValueError("opposite_record_scope requires CORE or ELECTIVE")


def resolve_working_scope(
    posting_scope: ExamInspectorSubjectScope,
    requested: ExamInspectorSubjectScope | str | None,
) -> ExamInspectorSubjectScope:
    """Resolve inspector working scope for bank official CRUD."""
    if posting_scope == ExamInspectorSubjectScope.CORE:
        if requested is not None:
            req = normalize_record_subject_scope(requested)
            if req != ExamInspectorSubjectScope.CORE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This workspace is Core only",
                )
        return ExamInspectorSubjectScope.CORE
    if posting_scope == ExamInspectorSubjectScope.ELECTIVE:
        if requested is not None:
            req = normalize_record_subject_scope(requested)
            if req != ExamInspectorSubjectScope.ELECTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This workspace is Elective only",
                )
        return ExamInspectorSubjectScope.ELECTIVE
    if requested is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="working_scope is required (CORE or ELECTIVE) for this workspace",
        )
    return normalize_record_subject_scope(requested)


def posting_allows_record_scope(
    posting_scope: ExamInspectorSubjectScope,
    record_scope: ExamInspectorSubjectScope,
) -> bool:
    if posting_scope == ExamInspectorSubjectScope.ALL:
        return True
    return posting_scope == record_scope


def posting_matches_timetable_filter(
    posting_scope: ExamInspectorSubjectScope | str,
    subject_filter: TimetableDownloadFilter,
) -> bool:
    """Whether an inspector posting counts for a finance/timetable subject-scope filter."""
    if subject_filter == TimetableDownloadFilter.ALL:
        return True
    if isinstance(posting_scope, str):
        scope = ExamInspectorSubjectScope(posting_scope)
    else:
        scope = posting_scope
    if scope == ExamInspectorSubjectScope.ALL:
        return True
    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        return scope == ExamInspectorSubjectScope.CORE
    if subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        return scope == ExamInspectorSubjectScope.ELECTIVE
    return True


def sheets_visible_to_posting(
    posting_scope: ExamInspectorSubjectScope,
    sheet_scope: ExamInspectorSubjectScope,
) -> bool:
    if posting_scope == ExamInspectorSubjectScope.ALL:
        return True
    return posting_scope == sheet_scope


def attendance_sheet_accessible_in_workspace(
    ctx: InspectorWorkspaceContext,
    sheet: InspectorAttendanceSheet,
) -> bool:
    """Whether an attendance sheet at the workspace centre is visible to this posting."""
    return (
        sheet.examination_centre_id == ctx.examination_centre.id
        and sheets_visible_to_posting(ctx.subject_scope, sheet.subject_scope)
    )


async def _codes_on_centre_date(
    session: AsyncSession,
    examination_id: int,
    scope_ids: set[UUID],
    examination_date: date,
) -> set[str]:
    entries = await staff_center_filtered_timetable_entries(
        session,
        examination_id,
        scope_ids,
        subject_filter=TimetableDownloadFilter.ALL,
    )
    return {e.subject_code for e in entries if e.examination_date == examination_date}


async def scopes_for_centre_date(
    session: AsyncSession,
    examination_id: int,
    scope_ids: set[UUID],
    examination_date: date,
) -> set[ExamInspectorSubjectScope]:
    codes = await _codes_on_centre_date(session, examination_id, scope_ids, examination_date)
    if not codes:
        return set()
    scopes: set[ExamInspectorSubjectScope] = set()
    core_codes = await filter_schedule_codes_by_subject_type(
        session, codes, TimetableDownloadFilter.CORE_ONLY
    )
    if core_codes:
        scopes.add(ExamInspectorSubjectScope.CORE)
    elec_codes = await filter_schedule_codes_by_subject_type(
        session, codes, TimetableDownloadFilter.ELECTIVE_ONLY
    )
    if elec_codes:
        scopes.add(ExamInspectorSubjectScope.ELECTIVE)
    return scopes


def _scopes_allowed_for_posting(
    posting_scope: ExamInspectorSubjectScope,
    scopes_on_date: set[ExamInspectorSubjectScope],
) -> set[ExamInspectorSubjectScope]:
    if posting_scope == ExamInspectorSubjectScope.CORE:
        return {ExamInspectorSubjectScope.CORE} & scopes_on_date
    if posting_scope == ExamInspectorSubjectScope.ELECTIVE:
        return {ExamInspectorSubjectScope.ELECTIVE} & scopes_on_date
    return scopes_on_date


def resolve_attendance_scope(
    posting_scope: ExamInspectorSubjectScope,
    scopes_on_date: set[ExamInspectorSubjectScope],
    requested_scope: ExamInspectorSubjectScope | str | None,
) -> ExamInspectorSubjectScope:
    allowed = _scopes_allowed_for_posting(posting_scope, scopes_on_date)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="examination_date is not a scheduled date for this examination centre",
        )
    if len(allowed) == 1:
        only = next(iter(allowed))
        if requested_scope is not None:
            req = normalize_record_subject_scope(requested_scope)
            if req != only:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"subject_scope must be {only.value} for this examination date",
                )
        return only
    if requested_scope is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="subject_scope is required (CORE or ELECTIVE) when both run on this date",
        )
    req = normalize_record_subject_scope(requested_scope)
    if req not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="subject_scope is not valid for this examination date",
        )
    return req


@dataclass(frozen=True)
class ScheduledDateItem:
    examination_date: date
    subject_scopes: tuple[str, ...]


async def scheduled_date_items_for_workspace(
    session: AsyncSession,
    examination_id: int,
    ctx: InspectorWorkspaceContext,
) -> list[ScheduledDateItem]:
    entries = await staff_center_filtered_timetable_entries(
        session,
        examination_id,
        ctx.scope_ids,
        subject_filter=TimetableDownloadFilter.ALL,
    )
    dates = sorted({e.examination_date for e in entries}, reverse=True)
    items: list[ScheduledDateItem] = []
    for d in dates:
        scopes_on_date = await scopes_for_centre_date(session, examination_id, ctx.scope_ids, d)
        allowed = _scopes_allowed_for_posting(ctx.subject_scope, scopes_on_date)
        if not allowed:
            continue
        scope_strs = tuple(sorted(s.value for s in allowed))
        items.append(ScheduledDateItem(examination_date=d, subject_scopes=scope_strs))
    return items
