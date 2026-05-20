"""Attendance sheet filename helper and timetable date filter mapping."""

from datetime import date

import pytest

from app.models import ExamInspectorSubjectScope
from app.schemas.timetable import TimetableDownloadFilter
from app.services.admin_attendance_zip import unique_zip_entry_names
from app.services.attendance_sheet_files import (
    AttendanceSheetUploadError,
    attendance_normalized_extension,
    build_attendance_sheet_filename,
)
from app.routers.attendance_sheets import admin_attendance_list_search_pattern
from app.services.script_control import assert_script_packing_calendar_allowed
from app.services.timetable_dates import timetable_filter_for_inspector_scope


def test_build_attendance_sheet_filename_basic() -> None:
    name = build_attendance_sheet_filename(
        "ACC-01",
        "Wesley Girls High",
        date(2026, 5, 19),
        ".pdf",
    )
    assert name == "ACC-01 Wesley Gir 2026-05-19.pdf"


def test_build_attendance_sheet_filename_collision() -> None:
    name = build_attendance_sheet_filename(
        "ACC-01",
        "Wesley Girls",
        date(2026, 5, 19),
        ".pdf",
        collision_index=2,
    )
    assert name == "ACC-01 Wesley Gir 2026-05-19 (2).pdf"


def test_build_attendance_sheet_filename_sanitizes_unsafe_chars() -> None:
    name = build_attendance_sheet_filename(
        "C/01",
        'Centre "A"',
        date(2026, 5, 20),
        ".png",
    )
    assert "/" not in name
    assert '"' not in name
    assert name.endswith(".png")


def test_attendance_normalized_extension_pdf() -> None:
    assert attendance_normalized_extension("sheet.PDF") == ".pdf"


def test_attendance_normalized_extension_rejects_docx() -> None:
    with pytest.raises(AttendanceSheetUploadError):
        attendance_normalized_extension("notes.docx")


def test_unique_zip_entry_names_dedupes_collisions() -> None:
    names = unique_zip_entry_names(["sheet.pdf", "sheet.pdf", "other.png"])
    assert names == ["sheet.pdf", "sheet_2.pdf", "other.png"]


def test_admin_attendance_list_search_pattern() -> None:
    assert admin_attendance_list_search_pattern(None) is None
    assert admin_attendance_list_search_pattern("") is None
    assert admin_attendance_list_search_pattern("   ") is None
    assert admin_attendance_list_search_pattern("  Wesley  ") == "%Wesley%"


def test_assert_script_packing_calendar_allowed_blocks_future_date() -> None:
    today = date(2026, 5, 20)
    with pytest.raises(ValueError, match="on or after the scheduled examination date"):
        assert_script_packing_calendar_allowed(date(2026, 5, 21), today)


def test_assert_script_packing_calendar_allowed_allows_same_day() -> None:
    today = date(2026, 5, 20)
    assert_script_packing_calendar_allowed(date(2026, 5, 20), today)


def test_timetable_filter_for_inspector_scope() -> None:
    assert timetable_filter_for_inspector_scope(ExamInspectorSubjectScope.ALL) == TimetableDownloadFilter.ALL
    assert timetable_filter_for_inspector_scope(ExamInspectorSubjectScope.CORE) == TimetableDownloadFilter.CORE_ONLY
    assert (
        timetable_filter_for_inspector_scope(ExamInspectorSubjectScope.ELECTIVE)
        == TimetableDownloadFilter.ELECTIVE_ONLY
    )
