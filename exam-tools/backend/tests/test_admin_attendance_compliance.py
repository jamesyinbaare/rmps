"""Admin attendance compliance helpers."""

from datetime import date

import pytest

from app.routers.attendance_sheets import admin_attendance_list_search_pattern
from app.services.admin_attendance_compliance import (
    _matches_search,
    ExpectedCentreRow,
    attendance_upload_status,
)
from app.services.script_control import assert_script_packing_calendar_allowed
from uuid import uuid4


def test_matches_search_centre_code() -> None:
    row = ExpectedCentreRow(
        center_id=uuid4(),
        center_code="ABC123",
        center_name="Test Centre",
        inspector_user_id=uuid4(),
        inspector_full_name="Jane Inspector",
        inspector_phone=None,
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
