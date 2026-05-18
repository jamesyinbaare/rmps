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
        }
    )
    targets = inspector_posting_targets_from_bulk_row(row)
    assert targets == [
        (ExamInspectorSubjectScope.ALL, "H001"),
        (ExamInspectorSubjectScope.CORE, "H002"),
    ]


def test_bulk_row_requires_at_least_one_pair() -> None:
    row = pd.Series({"phone_number": "1", "full_name": "X"})
    with pytest.raises(ValueError, match="At least one center_N and scope_N pair"):
        inspector_posting_targets_from_bulk_row(row)


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
    ws.append(
        [
            "phone_number",
            "full_name",
            "password",
            "center_1",
            "scope_1",
            "center_2",
            "scope_2",
            "center_3",
            "scope_3",
            "center_4",
            "scope_4",
            "center_5",
            "scope_5",
        ]
    )
    ws.append(["0244123456", "Jane", "pw12345678", "H001", "CORE", "", "", "", "", "", "", "", ""])
    ws["A2"].number_format = "@"
    buf = io.BytesIO()
    wb.save(buf)

    df = read_upload_as_dataframe(buf.getvalue(), "upload.xlsx", all_columns_as_string=True)
    assert list(df.columns) == [
        "phone_number",
        "full_name",
        "password",
        "center_1",
        "scope_1",
        "center_2",
        "scope_2",
        "center_3",
        "scope_3",
        "center_4",
        "scope_4",
        "center_5",
        "scope_5",
    ]
    assert df.iloc[0]["phone_number"] == "0244123456"
