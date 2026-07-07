"""Unit tests for examiner marking attendance sheet PDF row data."""

from unittest.mock import MagicMock

from app.models import ExaminerType, Region
from app.services.examiner_attendance_sheet_pdf import (
    AttendanceSheetSortField,
    _attendance_sheet_rows,
    sort_examiners_for_attendance_sheet,
)


def _examiner(
    *,
    name: str = "Jane Doe",
    reference_code: str | None = "MATH301-NAE1",
    region: Region = Region.NORTHERN,
) -> MagicMock:
    examiner = MagicMock()
    examiner.name = name
    examiner.reference_code = reference_code
    examiner.examiner_type = ExaminerType.ASSISTANT
    examiner.region = region
    return examiner


def test_attendance_sheet_rows_use_reference_code() -> None:
    rows = _attendance_sheet_rows([_examiner()])

    assert len(rows) == 1
    assert rows[0] == {
        "index": 1,
        "name": "Jane Doe",
        "reference_code": "MATH301-NAE1",
        "region": Region.NORTHERN.value,
    }
    assert "designation" not in rows[0]


def test_attendance_sheet_rows_empty_when_reference_code_missing() -> None:
    rows = _attendance_sheet_rows([_examiner(reference_code=None)])

    assert rows[0]["reference_code"] == ""


def test_attendance_sheet_rows_strip_reference_code() -> None:
    rows = _attendance_sheet_rows([_examiner(reference_code="  MATH301-NAE1  ")])

    assert rows[0]["reference_code"] == "MATH301-NAE1"


def test_sort_examiners_by_reference_code_default() -> None:
    examiners = [
        _examiner(name="Charlie", reference_code="B-002"),
        _examiner(name="Alice", reference_code="A-001"),
        _examiner(name="Bob", reference_code="A-002"),
        _examiner(name="No Code", reference_code=None),
    ]

    sorted_examiners = sort_examiners_for_attendance_sheet(
        examiners,
        AttendanceSheetSortField.REFERENCE_CODE,
    )

    assert [e.name for e in sorted_examiners] == ["Alice", "Bob", "Charlie", "No Code"]


def test_sort_examiners_by_reference_code_natural_numeric_order() -> None:
    examiners = [
        _examiner(name="Ten", reference_code="C704-SAE10"),
        _examiner(name="Two", reference_code="C704-SAE2"),
        _examiner(name="One", reference_code="C704-SAE1"),
    ]

    sorted_examiners = sort_examiners_for_attendance_sheet(
        examiners,
        AttendanceSheetSortField.REFERENCE_CODE,
    )

    assert [e.reference_code for e in sorted_examiners] == [
        "C704-SAE1",
        "C704-SAE2",
        "C704-SAE10",
    ]


def test_sort_examiners_by_name() -> None:
    examiners = [
        _examiner(name="Charlie", reference_code="C-001"),
        _examiner(name="alice", reference_code="A-001"),
        _examiner(name="Bob", reference_code="B-001"),
    ]

    sorted_examiners = sort_examiners_for_attendance_sheet(examiners, AttendanceSheetSortField.NAME)

    assert [e.name for e in sorted_examiners] == ["alice", "Bob", "Charlie"]


def test_sort_examiners_by_region_then_name() -> None:
    examiners = [
        _examiner(name="Zed", reference_code="Z-001", region=Region.CENTRAL),
        _examiner(name="Amy", reference_code="A-001", region=Region.NORTHERN),
        _examiner(name="Bob", reference_code="B-001", region=Region.NORTHERN),
    ]

    sorted_examiners = sort_examiners_for_attendance_sheet(examiners, AttendanceSheetSortField.REGION)

    assert [e.name for e in sorted_examiners] == ["Zed", "Amy", "Bob"]


def test_sort_examiners_reindexes_rows() -> None:
    examiners = [
        _examiner(name="Charlie", reference_code="C-001"),
        _examiner(name="Alice", reference_code="A-001"),
    ]

    sorted_examiners = sort_examiners_for_attendance_sheet(
        examiners,
        AttendanceSheetSortField.REFERENCE_CODE,
    )
    rows = _attendance_sheet_rows(sorted_examiners)

    assert [row["index"] for row in rows] == [1, 2]
    assert [row["name"] for row in rows] == ["Alice", "Charlie"]
