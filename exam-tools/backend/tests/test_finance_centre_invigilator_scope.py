"""Tests for scope-aware finance centre invigilator calculations."""

from datetime import date, time
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import CentreStructureMode, School
from app.schemas.examination import StaffCentreDaySummaryResponse, TimetableEntry
from app.schemas.timetable import TimetableDownloadFilter


def _centre(code: str = "C001") -> MagicMock:
    centre = MagicMock()
    centre.id = uuid4()
    centre.code = code
    centre.name = "Test Centre"
    return centre


def _school(school_id=None, code: str = "S001") -> School:
    s = MagicMock(spec=School)
    s.id = school_id or uuid4()
    s.code = code
    s.name = "School"
    return s


@pytest.mark.asyncio
async def test_build_finance_centre_invigilator_item_returns_empty_when_no_scope_schools() -> None:
    from app.routers.examinations import _build_finance_centre_invigilator_item

    centre = _centre()
    session = AsyncMock()
    exam = MagicMock()
    exam.centre_structure_mode = CentreStructureMode.SPLIT

    with (
        patch(
            "app.routers.examinations.load_examination_or_raise",
            new_callable=AsyncMock,
            return_value=exam,
        ),
        patch(
            "app.routers.examinations.centre_scope_school_ids_for_host_overview",
            new_callable=AsyncMock,
            return_value={uuid4()},
        ),
        patch(
            "app.routers.examinations.scope_ids_for_centre_subject_filter",
            new_callable=AsyncMock,
            return_value=set(),
        ),
    ):
        item = await _build_finance_centre_invigilator_item(
            session, 1, centre, TimetableDownloadFilter.CORE_ONLY
        )

    assert item.days == []
    assert item.center_code == "C001"


@pytest.mark.asyncio
async def test_build_finance_centre_invigilator_item_uses_membership_scope_and_exam_centre() -> None:
    from app.routers.examinations import _build_finance_centre_invigilator_item

    centre = _centre()
    core_school = _school(code="CORE1")
    scope_ids = {core_school.id}
    session = AsyncMock()
    exam = MagicMock()
    exam.centre_structure_mode = CentreStructureMode.SPLIT
    exam_date = date(2026, 5, 1)
    entry = TimetableEntry(
        examination_date=exam_date,
        examination_time=time(9, 0),
        subject_code="MATH",
        subject_name="Math",
        paper=1,
    )

    mock_timetable = AsyncMock(return_value=[entry])
    mock_day_summary = AsyncMock(
        return_value=StaffCentreDaySummaryResponse(
            examination_date=exam_date,
            schools=[],
            slots=[],
            unique_candidates=25,
            invigilators_required=1,
        )
    )

    with (
        patch(
            "app.routers.examinations.load_examination_or_raise",
            new_callable=AsyncMock,
            return_value=exam,
        ),
        patch(
            "app.routers.examinations.centre_scope_school_ids_for_host_overview",
            new_callable=AsyncMock,
            return_value=scope_ids | {uuid4()},
        ),
        patch(
            "app.routers.examinations.scope_ids_for_centre_subject_filter",
            new_callable=AsyncMock,
            return_value=scope_ids,
        ) as mock_scope_filter,
        patch(
            "app.routers.examinations._schools_with_ids_ordered_by_code",
            new_callable=AsyncMock,
            return_value=[core_school],
        ),
        patch(
            "app.routers.examinations._staff_center_filtered_timetable_entries",
            mock_timetable,
        ) as mock_timetable_entries,
        patch(
            "app.routers.examinations._build_staff_day_summary_for_scope",
            mock_day_summary,
        ),
    ):
        item = await _build_finance_centre_invigilator_item(
            session, 1, centre, TimetableDownloadFilter.CORE_ONLY
        )

    mock_scope_filter.assert_awaited_once()
    mock_timetable_entries.assert_awaited_once()
    call_kwargs = mock_timetable_entries.await_args.kwargs
    assert call_kwargs["subject_filter"] == TimetableDownloadFilter.CORE_ONLY
    assert call_kwargs["exam_centre"] is centre
    assert mock_timetable_entries.await_args.args[2] == scope_ids

    assert len(item.days) == 1
    assert item.days[0].unique_candidates == 25
    assert item.days[0].invigilators_required == 1


@pytest.mark.asyncio
async def test_build_finance_centre_invigilator_item_unified_uses_full_scope_without_exam_centre() -> None:
    from app.routers.examinations import _build_finance_centre_invigilator_item

    centre = _centre()
    school_a = _school()
    scope_ids = {school_a.id}
    session = AsyncMock()
    exam = MagicMock()
    exam.centre_structure_mode = CentreStructureMode.UNIFIED

    with (
        patch(
            "app.routers.examinations.load_examination_or_raise",
            new_callable=AsyncMock,
            return_value=exam,
        ),
        patch(
            "app.routers.examinations.centre_scope_school_ids_for_host_overview",
            new_callable=AsyncMock,
            return_value=scope_ids,
        ),
        patch(
            "app.routers.examinations.scope_ids_for_centre_subject_filter",
            new_callable=AsyncMock,
            return_value=scope_ids,
        ),
        patch(
            "app.routers.examinations._schools_with_ids_ordered_by_code",
            new_callable=AsyncMock,
            return_value=[school_a],
        ),
        patch(
            "app.routers.examinations._staff_center_filtered_timetable_entries",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_timetable_entries,
    ):
        await _build_finance_centre_invigilator_item(
            session, 1, centre, TimetableDownloadFilter.CORE_ONLY
        )

    assert mock_timetable_entries.await_args.kwargs["exam_centre"] is None


@pytest.mark.asyncio
async def test_build_finance_centre_invigilator_item_uses_host_overview_for_all_scopes() -> None:
    from app.routers.examinations import _build_finance_centre_invigilator_item

    centre = _centre()
    school_a = _school()
    school_b = _school()
    union_ids = {school_a.id, school_b.id}
    session = AsyncMock()
    exam = MagicMock()
    exam.centre_structure_mode = CentreStructureMode.SPLIT

    with (
        patch(
            "app.routers.examinations.load_examination_or_raise",
            new_callable=AsyncMock,
            return_value=exam,
        ),
        patch(
            "app.routers.examinations.centre_scope_school_ids_for_host_overview",
            new_callable=AsyncMock,
            return_value=union_ids,
        ) as mock_host_overview,
        patch(
            "app.routers.examinations.scope_ids_for_centre_subject_filter",
            new_callable=AsyncMock,
            return_value=union_ids,
        ),
        patch(
            "app.routers.examinations._schools_with_ids_ordered_by_code",
            new_callable=AsyncMock,
            return_value=[school_a, school_b],
        ),
        patch(
            "app.routers.examinations._staff_center_filtered_timetable_entries",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        item = await _build_finance_centre_invigilator_item(
            session, 1, centre, TimetableDownloadFilter.ALL
        )

    mock_host_overview.assert_awaited_once()
    assert item.days == []


@pytest.mark.asyncio
async def test_invigilator_summary_shell_uses_official_statistics_centre_list() -> None:
    from app.routers.examinations import get_finance_centre_invigilator_summary_shell

    centre = _centre()
    session = AsyncMock()

    with (
        patch(
            "app.routers.examinations.load_examination_or_raise",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.finance_official_statistics.list_centres_for_official_statistics",
            new_callable=AsyncMock,
            return_value=[centre],
        ) as mock_list,
        patch(
            "app.routers.examinations._finance_examination_dates_for_filter",
            new_callable=AsyncMock,
            return_value=[date(2026, 5, 1)],
        ),
    ):
        response = await get_finance_centre_invigilator_summary_shell(
            1,
            session,
            MagicMock(),
            subject_filter=TimetableDownloadFilter.CORE_ONLY,
        )

    mock_list.assert_awaited_once_with(session, 1, TimetableDownloadFilter.CORE_ONLY)
    assert len(response.centres) == 1
    assert response.centres[0].center_code == "C001"
