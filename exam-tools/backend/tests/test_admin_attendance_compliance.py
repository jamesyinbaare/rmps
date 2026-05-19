"""Admin attendance compliance helpers."""

from app.routers.attendance_sheets import admin_attendance_list_search_pattern
from app.services.admin_attendance_compliance import _matches_search, ExpectedCentreRow
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
