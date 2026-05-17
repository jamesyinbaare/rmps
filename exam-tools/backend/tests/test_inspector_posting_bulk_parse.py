"""Spreadsheet helpers for inspector posting bulk upload."""

import pandas as pd
import pytest

from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    inspector_phone_lookup_candidates,
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
