"""Spreadsheet helpers for inspector posting bulk upload."""

import pandas as pd
import pytest

from app.models import ExamInspectorSubjectScope
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    inspector_phone_lookup_candidates,
    inspector_posting_targets_from_bulk_row,
    parse_inspector_phone_number,
    parse_optional_examination_centre_host_code,
    validate_inspector_posting_bulk_required_columns,
)


def test_parse_optional_centre_code_empty() -> None:
    assert parse_optional_examination_centre_host_code(None) is None
    assert parse_optional_examination_centre_host_code("") is None
    assert parse_optional_examination_centre_host_code("  ") is None


def test_parse_optional_centre_code_numeric_cell() -> None:
    assert parse_optional_examination_centre_host_code(817002.0) == "817002"


def test_bulk_row_explicit_center_scope_pairs() -> None:
    row = pd.Series(
        {
            "center_1": "H001",
            "scope_1": "ALL",
            "center_2": "H002",
            "scope_2": "CORE",
            "core": "",
            "elective": "",
        }
    )
    targets = inspector_posting_targets_from_bulk_row(row, core_code=None, elective_code=None)
    assert targets == [
        (ExamInspectorSubjectScope.ALL, "H001"),
        (ExamInspectorSubjectScope.CORE, "H002"),
    ]


def test_bulk_row_falls_back_to_core_elective() -> None:
    row = pd.Series({"core": "H001", "elective": "H002"})
    targets = inspector_posting_targets_from_bulk_row(row, core_code="H001", elective_code="H002")
    assert targets == [
        (ExamInspectorSubjectScope.CORE, "H001"),
        (ExamInspectorSubjectScope.ELECTIVE, "H002"),
    ]


def test_validate_bulk_columns_missing() -> None:
    df = pd.DataFrame([{"phone_number": "1", "full_name": "X", "password": "secret123"}])
    df.columns = ["phone_number", "full_name", "password"]
    validate_inspector_posting_bulk_required_columns(df)

    bad = pd.DataFrame([{"phone_number": "A"}])
    with pytest.raises(SchoolUploadParseError, match="Missing required"):
        validate_inspector_posting_bulk_required_columns(bad)


def test_parse_inspector_phone_excel_float_strips_decimal() -> None:
    assert parse_inspector_phone_number(244123456.0) == "244123456"


def test_inspector_phone_lookup_candidates_legacy_float_string() -> None:
    assert inspector_phone_lookup_candidates("244123456") == ["244123456", "244123456.0"]
    assert inspector_phone_lookup_candidates("244123456.0") == ["244123456.0", "244123456"]


def test_read_upload_as_string_preserves_leading_zero_in_xlsx() -> None:
    import io

    from openpyxl import Workbook

    from app.services.school_bulk_upload import read_upload_as_dataframe

    wb = Workbook()
    ws = wb.active
    ws.append(["phone_number", "full_name", "password", "core", "elective"])
    ws.append(["0244123456", "Jane", "pw12345678", "C1", ""])
    ws["A2"].number_format = "@"
    buf = io.BytesIO()
    wb.save(buf)

    df = read_upload_as_dataframe(buf.getvalue(), "upload.xlsx", all_columns_as_string=True)
    assert list(df.columns) == ["phone_number", "full_name", "password", "core", "elective"]
    assert df.iloc[0]["phone_number"] == "0244123456"
