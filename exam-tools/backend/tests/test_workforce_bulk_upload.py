"""Tests for workforce roster Excel bulk upload parsing."""

from __future__ import annotations

from app.services.template_generator import generate_workforce_roster_bulk_template
from app.services.workforce_bulk_upload import read_workforce_roster_spreadsheet


def test_workforce_roster_template_has_expected_columns() -> None:
    raw = generate_workforce_roster_bulk_template()
    df = read_workforce_roster_spreadsheet(raw, "template.xlsx")
    assert "name" in df.columns
    assert "phone_number" in df.columns
    assert "region" in df.columns
    assert "cohort_name" in df.columns
    assert len(df) >= 1


def test_workforce_roster_spreadsheet_renames_aliases() -> None:
    csv = (
        "full_name,phone,region,cohort\n"
        "Jane Doe,0551234567,Greater Accra,East Legon\n"
    ).encode("utf-8")
    df = read_workforce_roster_spreadsheet(csv, "upload.csv")
    assert list(df.columns) == ["name", "phone_number", "region", "cohort_name"]
    assert df.iloc[0]["name"] == "Jane Doe"
    assert df.iloc[0]["cohort_name"] == "East Legon"
