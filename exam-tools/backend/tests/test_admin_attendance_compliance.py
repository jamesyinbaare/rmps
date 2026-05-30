"""Admin attendance compliance helpers."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import ExamInspectorSubjectScope
from app.routers.attendance_sheets import admin_attendance_list_search_pattern
from app.services.admin_attendance_compliance import (
    ExpectedCentreRow,
    _matches_search,
    attendance_upload_status,
    list_centres_with_uploads,
)
from app.services.script_control import assert_script_packing_calendar_allowed


def test_matches_search_centre_code() -> None:
    row = ExpectedCentreRow(
        center_id=uuid4(),
        center_code="ABC123",
        center_name="Test Centre",
        inspector_user_id=uuid4(),
        inspector_full_name="Jane Inspector",
        inspector_phone=None,
        subject_scope="CORE",
        file_count=0,
        upload_status="missing",
    )
    assert _matches_search(row, "abc") is True
    assert _matches_search(row, "nomatch") is False


def test_admin_attendance_list_search_pattern_unchanged() -> None:
    assert admin_attendance_list_search_pattern("  foo  ") == "%foo%"


@pytest.mark.parametrize(
    ("examination_date", "today", "file_count", "expected"),
    [
        (date(2026, 5, 25), date(2026, 5, 20), 0, "not_due"),
        (date(2026, 5, 20), date(2026, 5, 20), 0, "missing"),
        (date(2026, 5, 19), date(2026, 5, 20), 0, "missing"),
        (date(2026, 5, 20), date(2026, 5, 20), 2, "uploaded"),
    ],
)
def test_attendance_upload_status(
    examination_date: date,
    today: date,
    file_count: int,
    expected: str,
) -> None:
    assert attendance_upload_status(examination_date, today, file_count) == expected


@pytest.mark.asyncio
async def test_list_centres_with_uploads_returns_all_centre_groups() -> None:
    """Distinct (centre, scope) groups are all returned; unlike paginated sheet rows (one per file)."""
    centre_ids = [uuid4(), uuid4(), uuid4()]
    agg_rows = [
        (centre_ids[0], ExamInspectorSubjectScope.CORE, "A01", "Centre A", 2),
        (centre_ids[1], ExamInspectorSubjectScope.CORE, "B02", "Centre B", 1),
        (centre_ids[2], ExamInspectorSubjectScope.ELECTIVE, "C03", "Centre C", 1),
    ]

    def make_sheet(center_id, scope: ExamInspectorSubjectScope, code: str, name: str) -> MagicMock:
        posting = MagicMock()
        posting.inspector_user_id = uuid4()
        posting.inspector_user = MagicMock(full_name="Inspector One", phone_number=None)
        sheet = MagicMock()
        sheet.examination_centre_id = center_id
        sheet.subject_scope = scope
        sheet.inspector_exam_posting = posting
        sheet.uploaded_by_id = None
        sheet.created_at = date(2026, 5, 20)
        sheet.id = uuid4()
        return sheet

    sheet_rows = [
        make_sheet(centre_ids[0], ExamInspectorSubjectScope.CORE, "A01", "Centre A"),
        make_sheet(centre_ids[1], ExamInspectorSubjectScope.CORE, "B02", "Centre B"),
        make_sheet(centre_ids[2], ExamInspectorSubjectScope.ELECTIVE, "C03", "Centre C"),
    ]

    agg_result = MagicMock()
    agg_result.all.return_value = agg_rows
    sheet_result = MagicMock()
    sheet_scalars = MagicMock()
    sheet_scalars.unique.return_value.all.return_value = sheet_rows
    sheet_result.scalars.return_value = sheet_scalars

    session = AsyncMock()
    session.execute = AsyncMock(side_effect=[agg_result, sheet_result])

    rows = await list_centres_with_uploads(session, examination_id=1)
    assert len(rows) == 3
    assert {r.center_code for r in rows} == {"A01", "B02", "C03"}
    assert all(r.upload_status == "uploaded" for r in rows)
    assert sum(r.file_count for r in rows) == 4
    assert session.execute.await_count == 2


def test_upload_centres_route_registered_before_sheet_id_path() -> None:
    from app.main import app

    paths = [getattr(r, "path", "") for r in app.routes]
    upload_path = "/admin/examinations/{examination_id}/attendance-sheets/upload-centres"
    assert upload_path in paths
