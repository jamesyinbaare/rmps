"""Unit tests for examiner marking attendance sheet PDF row data."""

from unittest.mock import MagicMock

from app.models import ExaminerType, Region
from app.services.examiner_attendance_sheet_pdf import _attendance_sheet_rows


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
