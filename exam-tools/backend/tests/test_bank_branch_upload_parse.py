"""Spreadsheet helpers for bank branch bulk upload (leading-zero bank codes)."""

import io

from openpyxl import Workbook

from app.services.school_bulk_upload import parse_bank_code_cell, read_upload_as_dataframe


def test_parse_bank_code_cell_preserves_leading_zeros() -> None:
    assert parse_bank_code_cell("001111") == "001111"


def test_parse_bank_code_cell_strips_excel_float_suffix_from_non_string() -> None:
    assert parse_bank_code_cell(123456.0) == "123456"


def test_read_upload_csv_preserves_leading_zero_bank_code() -> None:
    content = b"bank_code,bank_name,branch_name\n001111,Foo Bank,Main Branch\n"
    df = read_upload_as_dataframe(content, "branches.csv", all_columns_as_string=True)
    assert df.iloc[0]["bank_code"] == "001111"


def test_read_upload_xlsx_preserves_leading_zero_bank_code() -> None:
    wb = Workbook()
    ws = wb.active
    ws.append(["bank_code", "bank_name", "branch_name"])
    ws.append(["001111", "Foo Bank", "Main Branch"])
    ws["A2"].number_format = "@"
    buf = io.BytesIO()
    wb.save(buf)

    df = read_upload_as_dataframe(buf.getvalue(), "branches.xlsx", all_columns_as_string=True)
    assert list(df.columns) == ["bank_code", "bank_name", "branch_name"]
    assert df.iloc[0]["bank_code"] == "001111"
