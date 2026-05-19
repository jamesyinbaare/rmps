"""Admin attendance sheet compliance: expected centres vs uploads for a scheduled date."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import InspectorAttendanceSheet, InspectorExamPosting, School, User
from app.services.inspector_posting import InspectorWorkspaceContext, assert_centre_host_school
from app.services.timetable_dates import scheduled_examination_dates_for_inspector_workspace
from app.services.timetable_service import center_scope_school_ids

UploadStatusFilter = str  # "all" | "uploaded" | "missing"


@dataclass(frozen=True)
class ExpectedCentreRow:
    center_id: UUID
    center_code: str
    center_name: str
    inspector_user_id: UUID
    inspector_full_name: str
    inspector_phone: str | None
    file_count: int
    upload_status: str  # "uploaded" | "missing"


async def _scheduled_dates_for_posting(
    session: AsyncSession,
    examination_id: int,
    posting: InspectorExamPosting,
    cache: dict[UUID, set[date]],
) -> set[date]:
    if posting.id in cache:
        return cache[posting.id]
    host = await assert_centre_host_school(session, posting.center_id)
    scope_ids = await center_scope_school_ids(session, host)
    ctx = InspectorWorkspaceContext(
        center_host=host,
        scope_ids=scope_ids,
        subject_scope=posting.subject_scope,
        posting=posting,
    )
    dates = await scheduled_examination_dates_for_inspector_workspace(session, examination_id, ctx)
    cache[posting.id] = set(dates)
    return cache[posting.id]


async def _upload_counts_by_center(
    session: AsyncSession,
    examination_id: int,
    examination_date: date,
) -> dict[UUID, int]:
    stmt = (
        select(
            InspectorAttendanceSheet.center_id,
            func.count(InspectorAttendanceSheet.id),
        )
        .where(
            InspectorAttendanceSheet.examination_id == examination_id,
            InspectorAttendanceSheet.examination_date == examination_date,
        )
        .group_by(InspectorAttendanceSheet.center_id)
    )
    result = await session.execute(stmt)
    return {row[0]: int(row[1]) for row in result.all()}


async def expected_centres_for_examination_date(
    session: AsyncSession,
    examination_id: int,
    examination_date: date,
) -> dict[UUID, ExpectedCentreRow]:
    """Centres with at least one posting whose timetable includes ``examination_date``."""
    stmt = (
        select(InspectorExamPosting)
        .where(InspectorExamPosting.examination_id == examination_id)
        .options(
            joinedload(InspectorExamPosting.center),
            joinedload(InspectorExamPosting.inspector_user),
        )
    )
    postings = list((await session.execute(stmt)).scalars().unique().all())
    upload_counts = await _upload_counts_by_center(session, examination_id, examination_date)
    date_cache: dict[UUID, set[date]] = {}
    by_center: dict[UUID, ExpectedCentreRow] = {}

    for posting in postings:
        scheduled = await _scheduled_dates_for_posting(session, examination_id, posting, date_cache)
        if examination_date not in scheduled:
            continue
        center = posting.center
        insp = posting.inspector_user
        if center is None:
            continue
        cid = posting.center_id
        if cid in by_center:
            continue
        count = upload_counts.get(cid, 0)
        by_center[cid] = ExpectedCentreRow(
            center_id=cid,
            center_code=str(center.code),
            center_name=str(center.name),
            inspector_user_id=posting.inspector_user_id,
            inspector_full_name=insp.full_name if insp else "—",
            inspector_phone=insp.phone_number if insp else None,
            file_count=count,
            upload_status="uploaded" if count > 0 else "missing",
        )
    return by_center


def _matches_search(row: ExpectedCentreRow, pattern: str | None) -> bool:
    if not pattern:
        return True
    q = pattern.strip().lower()
    if not q:
        return True
    return (
        row.center_code.lower().find(q) >= 0
        or row.center_name.lower().find(q) >= 0
        or row.inspector_full_name.lower().find(q) >= 0
    )


async def list_compliance_centres(
    session: AsyncSession,
    examination_id: int,
    examination_date: date,
    *,
    upload_status: UploadStatusFilter = "all",
    search: str | None = None,
) -> list[ExpectedCentreRow]:
    rows = list((await expected_centres_for_examination_date(session, examination_id, examination_date)).values())
    rows.sort(key=lambda r: r.center_code)
    if upload_status == "uploaded":
        rows = [r for r in rows if r.upload_status == "uploaded"]
    elif upload_status == "missing":
        rows = [r for r in rows if r.upload_status == "missing"]
    if search:
        rows = [r for r in rows if _matches_search(r, search)]
    return rows


def _upload_count_base(
    examination_id: int,
    examination_date: date | None,
    search_pattern: str | None,
):
    filters = [InspectorAttendanceSheet.examination_id == examination_id]
    if examination_date is not None:
        filters.append(InspectorAttendanceSheet.examination_date == examination_date)
    base = select(InspectorAttendanceSheet).join(InspectorAttendanceSheet.center)
    if search_pattern is not None:
        base = base.join(InspectorAttendanceSheet.inspector_exam_posting).join(
            InspectorExamPosting.inspector_user
        ).where(
            School.code.ilike(search_pattern)
            | School.name.ilike(search_pattern)
            | User.full_name.ilike(search_pattern)
        )
    return base.where(*filters)


async def admin_attendance_summary(
    session: AsyncSession,
    examination_id: int,
    *,
    examination_date: date | None,
    search_pattern: str | None,
) -> tuple[int, int, int | None, int | None]:
    """Returns (total_uploads, centres_with_uploads, centres_expected, centres_missing)."""
    base = _upload_count_base(examination_id, examination_date, search_pattern)
    total_uploads = int(
        (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    )
    centres_with_uploads = int(
        (
            await session.execute(
                select(func.count(func.distinct(InspectorAttendanceSheet.center_id))).select_from(
                    base.subquery()
                )
            )
        ).scalar_one()
    )

    centres_expected: int | None = None
    centres_missing: int | None = None
    if examination_date is not None:
        expected = await expected_centres_for_examination_date(session, examination_id, examination_date)
        if search_pattern is not None:
            q = search_pattern.strip("%").lower()
            expected = {cid: row for cid, row in expected.items() if _matches_search(row, q)}
        centres_expected = len(expected)
        centres_missing = sum(1 for r in expected.values() if r.upload_status == "missing")

    return total_uploads, centres_with_uploads, centres_expected, centres_missing
