"""Admin attendance sheet compliance: expected centres vs uploads for a scheduled date."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from app.models import (
    ExamInspectorSubjectScope,
    ExaminationCentre,
    InspectorAttendanceSheet,
    InspectorExamPosting,
    User,
)
from app.services.centre_resolution import centre_scope_school_ids_for_inspector_scope
from app.services.script_control import script_packing_today_in_configured_zone
from app.services.subject_scope import scopes_for_centre_date

UploadStatusFilter = str  # "all" | "uploaded" | "missing"


def attendance_upload_status(examination_date: date, today: date, file_count: int) -> str:
    """uploaded | missing | not_due (before the scheduled examination day)."""
    if today < examination_date:
        return "not_due"
    return "uploaded" if file_count > 0 else "missing"


def _scope_str(scope: ExamInspectorSubjectScope | str) -> str:
    if isinstance(scope, ExamInspectorSubjectScope):
        return scope.value
    return str(scope)


@dataclass(frozen=True)
class ExpectedCentreRow:
    center_id: UUID
    center_code: str
    center_name: str
    inspector_user_id: UUID
    inspector_full_name: str
    inspector_phone: str | None
    subject_scope: str
    file_count: int
    upload_status: str  # "uploaded" | "missing" | "not_due"


async def _upload_counts_by_center_and_scope(
    session: AsyncSession,
    examination_id: int,
    examination_date: date,
) -> dict[tuple[UUID, str], int]:
    stmt = (
        select(
            InspectorAttendanceSheet.examination_centre_id,
            InspectorAttendanceSheet.subject_scope,
            func.count(InspectorAttendanceSheet.id),
        )
        .where(
            InspectorAttendanceSheet.examination_id == examination_id,
            InspectorAttendanceSheet.examination_date == examination_date,
        )
        .group_by(
            InspectorAttendanceSheet.examination_centre_id,
            InspectorAttendanceSheet.subject_scope,
        )
    )
    result = await session.execute(stmt)
    out: dict[tuple[UUID, str], int] = {}
    for center_id, scope, count in result.all():
        out[(center_id, _scope_str(scope))] = int(count)
    return out


def _scopes_expected_for_posting(
    posting_scope: ExamInspectorSubjectScope,
    scopes_on_date: set[ExamInspectorSubjectScope],
) -> list[ExamInspectorSubjectScope]:
    if posting_scope == ExamInspectorSubjectScope.CORE:
        if ExamInspectorSubjectScope.CORE in scopes_on_date:
            return [ExamInspectorSubjectScope.CORE]
        return []
    if posting_scope == ExamInspectorSubjectScope.ELECTIVE:
        if ExamInspectorSubjectScope.ELECTIVE in scopes_on_date:
            return [ExamInspectorSubjectScope.ELECTIVE]
        return []
    return sorted(scopes_on_date, key=lambda s: s.value)


async def expected_centres_for_examination_date(
    session: AsyncSession,
    examination_id: int,
    examination_date: date,
) -> dict[tuple[UUID, str], ExpectedCentreRow]:
    """Expected (centre, scope) rows from timetable and inspector postings."""
    stmt = (
        select(InspectorExamPosting)
        .where(InspectorExamPosting.examination_id == examination_id)
        .options(
            joinedload(InspectorExamPosting.examination_centre),
            joinedload(InspectorExamPosting.inspector_user),
        )
    )
    postings = list((await session.execute(stmt)).scalars().unique().all())
    upload_counts = await _upload_counts_by_center_and_scope(session, examination_id, examination_date)
    today = script_packing_today_in_configured_zone()
    scope_cache: dict[UUID, set[ExamInspectorSubjectScope]] = {}
    by_key: dict[tuple[UUID, str], ExpectedCentreRow] = {}

    for posting in postings:
        center = posting.examination_centre
        if center is None:
            continue
        cid = posting.examination_centre_id
        if cid not in scope_cache:
            scope_ids = await centre_scope_school_ids_for_inspector_scope(
                session, center, posting.subject_scope
            )
            scope_cache[cid] = await scopes_for_centre_date(
                session, examination_id, scope_ids, examination_date
            )
        scopes_on_date = scope_cache[cid]
        expected_scopes = _scopes_expected_for_posting(posting.subject_scope, scopes_on_date)
        if not expected_scopes:
            continue
        insp = posting.inspector_user
        for scope in expected_scopes:
            scope_label = scope.value
            key = (cid, scope_label)
            if key in by_key:
                continue
            count = upload_counts.get(key, 0)
            by_key[key] = ExpectedCentreRow(
                center_id=cid,
                center_code=str(center.code),
                center_name=str(center.name),
                inspector_user_id=posting.inspector_user_id,
                inspector_full_name=insp.full_name if insp else "—",
                inspector_phone=insp.phone_number if insp else None,
                subject_scope=scope_label,
                file_count=count,
                upload_status=attendance_upload_status(examination_date, today, count),
            )
    return by_key


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


def _upload_list_filters(
    examination_id: int,
    examination_date: date | None,
    subject_scope: str | None,
    search_pattern: str | None,
) -> list:
    filters = [InspectorAttendanceSheet.examination_id == examination_id]
    if examination_date is not None:
        filters.append(InspectorAttendanceSheet.examination_date == examination_date)
    if subject_scope is not None:
        filters.append(InspectorAttendanceSheet.subject_scope == subject_scope.strip().upper())
    if search_pattern is not None:
        filters.append(
            ExaminationCentre.code.ilike(search_pattern)
            | ExaminationCentre.name.ilike(search_pattern)
            | User.full_name.ilike(search_pattern)
        )
    return filters


async def list_centres_with_uploads(
    session: AsyncSession,
    examination_id: int,
    *,
    examination_date: date | None = None,
    subject_scope: str | None = None,
    search: str | None = None,
) -> list[ExpectedCentreRow]:
    """Distinct (centre, scope) slots that have at least one uploaded attendance sheet."""
    search_pattern = None
    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
    filters = _upload_list_filters(examination_id, examination_date, subject_scope, search_pattern)

    agg_stmt = (
        select(
            InspectorAttendanceSheet.examination_centre_id,
            InspectorAttendanceSheet.subject_scope,
            ExaminationCentre.code,
            ExaminationCentre.name,
            func.count(InspectorAttendanceSheet.id).label("file_count"),
        )
        .select_from(InspectorAttendanceSheet)
        .join(InspectorAttendanceSheet.examination_centre)
        .join(InspectorAttendanceSheet.inspector_exam_posting)
        .join(InspectorExamPosting.inspector_user)
        .where(*filters)
        .group_by(
            InspectorAttendanceSheet.examination_centre_id,
            InspectorAttendanceSheet.subject_scope,
            ExaminationCentre.code,
            ExaminationCentre.name,
        )
        .order_by(ExaminationCentre.code.asc(), InspectorAttendanceSheet.subject_scope.asc())
    )
    agg_rows = (await session.execute(agg_stmt)).all()
    if not agg_rows:
        return []

    by_key: dict[tuple[UUID, str], tuple[int, str, str]] = {}
    for center_id, scope, code, name, file_count in agg_rows:
        by_key[(center_id, _scope_str(scope))] = (int(file_count), str(code), str(name))

    sheet_stmt = (
        select(InspectorAttendanceSheet)
        .join(InspectorAttendanceSheet.examination_centre)
        .join(InspectorAttendanceSheet.inspector_exam_posting)
        .join(InspectorExamPosting.inspector_user)
        .where(*filters)
        .options(
            contains_eager(InspectorAttendanceSheet.inspector_exam_posting).contains_eager(
                InspectorExamPosting.inspector_user
            ),
        )
        .order_by(
            InspectorAttendanceSheet.created_at.desc(),
            InspectorAttendanceSheet.id.desc(),
        )
    )
    sheets = list((await session.execute(sheet_stmt)).scalars().unique().all())

    seen: set[tuple[UUID, str]] = set()
    out: list[ExpectedCentreRow] = []
    for sheet in sheets:
        scope_label = _scope_str(sheet.subject_scope)
        key = (sheet.examination_centre_id, scope_label)
        if key in seen or key not in by_key:
            continue
        seen.add(key)
        file_count, code, name = by_key[key]
        posting = sheet.inspector_exam_posting
        insp = posting.inspector_user if posting else None
        out.append(
            ExpectedCentreRow(
                center_id=key[0],
                center_code=code,
                center_name=name,
                inspector_user_id=posting.inspector_user_id if posting else sheet.uploaded_by_id or key[0],
                inspector_full_name=insp.full_name if insp else "—",
                inspector_phone=insp.phone_number if insp else None,
                subject_scope=scope_label,
                file_count=file_count,
                upload_status="uploaded",
            )
        )
    out.sort(key=lambda r: (r.center_code, r.subject_scope))
    return out


async def list_compliance_centres(
    session: AsyncSession,
    examination_id: int,
    examination_date: date,
    *,
    upload_status: UploadStatusFilter = "all",
    search: str | None = None,
) -> list[ExpectedCentreRow]:
    rows = list((await expected_centres_for_examination_date(session, examination_id, examination_date)).values())
    rows.sort(key=lambda r: (r.center_code, r.subject_scope))
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
    subject_scope: str | None = None,
):
    filters = [InspectorAttendanceSheet.examination_id == examination_id]
    if examination_date is not None:
        filters.append(InspectorAttendanceSheet.examination_date == examination_date)
    if subject_scope is not None:
        filters.append(InspectorAttendanceSheet.subject_scope == subject_scope)
    base = select(InspectorAttendanceSheet).join(InspectorAttendanceSheet.examination_centre)
    if search_pattern is not None:
        base = base.join(InspectorAttendanceSheet.inspector_exam_posting).join(
            InspectorExamPosting.inspector_user
        ).where(
            ExaminationCentre.code.ilike(search_pattern)
            | ExaminationCentre.name.ilike(search_pattern)
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
    """Returns (total_uploads, centre_scope_slots_with_uploads, centres_expected, centres_missing)."""
    base = _upload_count_base(examination_id, examination_date, search_pattern)
    total_uploads = int(
        (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    )
    distinct_pairs = (
        select(
            InspectorAttendanceSheet.examination_centre_id,
            InspectorAttendanceSheet.subject_scope,
        )
        .select_from(base.subquery())
        .distinct()
    )
    centres_with_uploads = int(
        (await session.execute(select(func.count()).select_from(distinct_pairs.subquery()))).scalar_one()
    )

    centres_expected: int | None = None
    centres_missing: int | None = None
    if examination_date is not None:
        expected = await expected_centres_for_examination_date(session, examination_id, examination_date)
        if search_pattern is not None:
            q = search_pattern.strip("%").lower()
            expected = {k: row for k, row in expected.items() if _matches_search(row, q)}
        centres_expected = len(expected)
        centres_missing = sum(1 for r in expected.values() if r.upload_status == "missing")

    return total_uploads, centres_with_uploads, centres_expected, centres_missing
