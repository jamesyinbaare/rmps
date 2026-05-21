"""National executive monitoring: centre aggregation and centre-scoped overview."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    Examination,
    ExaminationCandidate,
    ExamInspectorSubjectScope,
    InspectorExamPosting,
    School,
    User,
)
from app.schemas.examination import (
    ExecutiveCentreDetailResponse,
    ExecutiveCentreListItem,
    ExecutivePostedInspectorItem,
    NationalExecutiveOverviewResponse,
    StaffCentreOverviewResponse,
    StaffCentreOverviewUpcomingItem,
    StaffCentreSchoolCandidateItem,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.timetable_service import (
    center_scope_school_ids,
    resolve_center_host_school,
    schools_in_center_scope_ordered,
)


async def _staff_center_filtered_timetable_entries(
    session: AsyncSession,
    exam_id: int,
    scope_ids: set[UUID],
):
    from app.routers.examinations import _staff_center_filtered_timetable_entries as _entries

    return await _entries(session, exam_id, scope_ids)


def _overview_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.script_packing_timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


async def build_centre_overview(
    session: AsyncSession,
    exam: Examination,
    center_host: School,
    *,
    display_school_code: str | None = None,
    display_school_name: str | None = None,
) -> StaffCentreOverviewResponse:
    """Centre-scoped stats and timetable slots for executive / staff dashboards."""
    from app.schemas.examination import TimetableEntry

    exam_id = exam.id
    scope_ids = await center_scope_school_ids(session, center_host)
    ordered_scope_schools = await schools_in_center_scope_ordered(session, center_host)
    school_count = len(scope_ids)

    candidate_count = 0
    cand_by_school: dict[UUID, int] = {}
    if scope_ids:
        cand_stmt = select(func.count()).select_from(ExaminationCandidate).where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(scope_ids),
        )
        candidate_count = int((await session.execute(cand_stmt)).scalar_one())
        cand_by_school_stmt = (
            select(ExaminationCandidate.school_id, func.count().label("candidate_count"))
            .where(
                ExaminationCandidate.examination_id == exam_id,
                ExaminationCandidate.school_id.in_(scope_ids),
            )
            .group_by(ExaminationCandidate.school_id)
        )
        cand_by_school_rows = await session.execute(cand_by_school_stmt)
        cand_by_school = {row[0]: int(row[1]) for row in cand_by_school_rows.all()}

    entries = await _staff_center_filtered_timetable_entries(session, exam_id, scope_ids)

    examination_centre_region = (
        center_host.region.value if center_host.region is not None else "—"
    )
    if entries:
        entry_dates = [e.examination_date for e in entries]
        examination_window_start = min(entry_dates)
        examination_window_end = max(entry_dates)
    else:
        examination_window_start = None
        examination_window_end = None

    tz = _overview_timezone()
    now = datetime.now(tz)

    upcoming_rows: list[TimetableEntry] = []
    for ent in entries:
        start = datetime.combine(ent.examination_date, ent.examination_time).replace(tzinfo=tz)
        if start >= now:
            upcoming_rows.append(ent)
    upcoming_rows.sort(
        key=lambda x: (x.examination_date, x.examination_time, x.subject_code, x.paper),
    )

    today_date = now.date()
    today_rows = [ent for ent in entries if ent.examination_date == today_date]
    today_rows.sort(
        key=lambda x: (x.examination_time, x.subject_code, x.paper),
    )

    sup_code = display_school_code if display_school_code is not None else str(center_host.code)
    sup_name = display_school_name if display_school_name is not None else str(center_host.name)

    return StaffCentreOverviewResponse(
        examination_id=exam.id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        year=exam.year,
        supervisor_school_code=sup_code,
        supervisor_school_name=sup_name,
        examination_centre_host_school_id=center_host.id,
        examination_centre_host_code=str(center_host.code),
        examination_centre_host_name=str(center_host.name),
        supervisor_school_is_centre_host=True,
        candidate_count=candidate_count,
        school_count=school_count,
        upcoming=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in upcoming_rows
        ],
        sessions_today=[
            StaffCentreOverviewUpcomingItem(
                subject_code=x.subject_code,
                subject_name=x.subject_name,
                paper=x.paper,
                examination_date=x.examination_date,
                examination_time=x.examination_time,
            )
            for x in today_rows
        ],
        examination_centre_region=examination_centre_region,
        examination_window_start=examination_window_start,
        examination_window_end=examination_window_end,
        schools_with_candidate_counts=[
            StaffCentreSchoolCandidateItem(
                school_id=s.id,
                school_code=s.code,
                school_name=s.name,
                candidate_count=cand_by_school.get(s.id, 0),
            )
            for s in ordered_scope_schools
        ],
        inspector_posted_workspaces=None,
    )


async def aggregate_executive_centres(
    session: AsyncSession,
    exam_id: int,
    school_ids: set[UUID],
) -> list[ExecutiveCentreListItem]:
    """One row per examination centre host with candidates in scope."""
    if not school_ids:
        return []

    stmt = select(School).where(School.id.in_(school_ids))
    schools_result = await session.execute(stmt)
    schools = list(schools_result.scalars().all())

    host_to_schools: dict[UUID, list[School]] = defaultdict(list)
    host_cache: dict[UUID, School] = {}

    for sch in schools:
        try:
            host = await resolve_center_host_school(session, sch)
        except ValueError:
            continue
        host_id = host.id
        host_cache[host_id] = host
        host_to_schools[host_id].append(sch)

    posting_counts: dict[UUID, int] = {}
    if host_cache:
        pc_stmt = (
            select(InspectorExamPosting.center_id, func.count())
            .where(
                InspectorExamPosting.examination_id == exam_id,
                InspectorExamPosting.center_id.in_(host_cache.keys()),
            )
            .group_by(InspectorExamPosting.center_id)
        )
        pc_result = await session.execute(pc_stmt)
        posting_counts = {row[0]: int(row[1]) for row in pc_result.all()}

    items: list[ExecutiveCentreListItem] = []
    for host_id, cluster_schools in host_to_schools.items():
        host = host_cache[host_id]
        scope_ids = await center_scope_school_ids(session, host)
        active_scope = scope_ids & school_ids
        if not active_scope:
            continue

        cand_stmt = select(func.count()).select_from(ExaminationCandidate).where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(active_scope),
        )
        candidate_count = int((await session.execute(cand_stmt)).scalar_one())

        schools_with_candidates = 0
        for sid in active_scope:
            c_stmt = select(func.count()).select_from(ExaminationCandidate).where(
                ExaminationCandidate.examination_id == exam_id,
                ExaminationCandidate.school_id == sid,
            )
            if int((await session.execute(c_stmt)).scalar_one()) > 0:
                schools_with_candidates += 1

        region_str = host.region.value if host.region is not None else "—"
        zone_str = host.zone.value if host.zone is not None else "—"

        items.append(
            ExecutiveCentreListItem(
                center_id=host.id,
                center_code=str(host.code),
                center_name=str(host.name),
                region=region_str,
                zone=zone_str,
                candidate_count=candidate_count,
                school_count=schools_with_candidates,
                inspector_count=posting_counts.get(host_id, 0),
            )
        )

    items.sort(key=lambda x: x.center_code)
    return items


async def count_executive_centres(
    session: AsyncSession,
    exam_id: int,
    school_ids: set[UUID],
) -> int:
    """Distinct examination centre hosts with at least one candidate (no per-centre detail rows)."""
    if not school_ids:
        return 0

    stmt = select(School).where(School.id.in_(school_ids))
    schools_result = await session.execute(stmt)
    schools = list(schools_result.scalars().all())

    host_to_schools: dict[UUID, list[School]] = defaultdict(list)
    host_cache: dict[UUID, School] = {}

    for sch in schools:
        try:
            host = await resolve_center_host_school(session, sch)
        except ValueError:
            continue
        host_id = host.id
        host_cache[host_id] = host
        host_to_schools[host_id].append(sch)

    count = 0
    for host_id in host_to_schools:
        host = host_cache[host_id]
        scope_ids = await center_scope_school_ids(session, host)
        active_scope = scope_ids & school_ids
        if not active_scope:
            continue
        cand_stmt = select(func.count()).select_from(ExaminationCandidate).where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(active_scope),
        )
        if int((await session.execute(cand_stmt)).scalar_one()) > 0:
            count += 1
    return count


async def load_posted_inspectors_for_centre(
    session: AsyncSession,
    examination_id: int,
    center_id: UUID,
) -> list[ExecutivePostedInspectorItem]:
    stmt = (
        select(InspectorExamPosting, User)
        .join(User, InspectorExamPosting.inspector_user_id == User.id)
        .where(
            InspectorExamPosting.examination_id == examination_id,
            InspectorExamPosting.center_id == center_id,
        )
        .order_by(User.full_name)
    )
    result = await session.execute(stmt)
    rows: list[ExecutivePostedInspectorItem] = []
    for posting, inspector in result.all():
        scope = posting.subject_scope
        if isinstance(scope, ExamInspectorSubjectScope):
            scope_str = scope.value
        else:
            scope_str = str(scope)
        rows.append(
            ExecutivePostedInspectorItem(
                posting_id=posting.id,
                inspector_full_name=cast(str, inspector.full_name),
                inspector_phone_number=cast(str | None, inspector.phone_number),
                subject_scope=scope_str,
            )
        )
    return rows


async def build_national_executive_overview(
    session: AsyncSession,
    exam_id: int,
    national_overview: StaffCentreOverviewResponse,
    scope_ids: set[UUID],
    *,
    include_centres: bool = True,
) -> NationalExecutiveOverviewResponse:
    if include_centres:
        centres = await aggregate_executive_centres(session, exam_id, scope_ids)
        centre_count = len(centres)
    else:
        centres = []
        centre_count = await count_executive_centres(session, exam_id, scope_ids)
    return NationalExecutiveOverviewResponse(
        **national_overview.model_dump(),
        centres=centres,
        centre_count=centre_count,
    )


async def build_executive_centre_detail(
    session: AsyncSession,
    exam_id: int,
    center_id: UUID,
) -> ExecutiveCentreDetailResponse:
    exam = await load_examination_or_raise(session, exam_id)
    host = await session.get(School, center_id)
    if host is None:
        raise ValueError("School not found")
    if host.writes_at_center_id is not None:
        raise ValueError("School is not an examination centre host")

    overview = await build_centre_overview(
        session,
        exam,
        host,
        display_school_code=str(host.code),
        display_school_name=str(host.name),
    )
    inspectors = await load_posted_inspectors_for_centre(session, exam_id, center_id)
    return ExecutiveCentreDetailResponse(overview=overview, posted_inspectors=inspectors)
