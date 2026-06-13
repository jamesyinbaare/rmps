"""Tests for manual marked scripts upload parsing."""

from uuid import uuid4

import pandas as pd
import pytest

from app.services.manual_marked_scripts_upload import parse_manual_marked_scripts_upload


def test_upload_matches_phone_and_applies_count() -> None:
    examiner_id = uuid4()
    phone_map = {"244123456": examiner_id, "244123456.0": examiner_id}
    df = pd.DataFrame([{"phone_number": "244123456", "total": 25}])
    result = parse_manual_marked_scripts_upload(df, phone_to_examiner_id=phone_map)
    assert result.errors == []
    assert result.applied_count == 1
    assert result.items == [(examiner_id, 25)]


def test_upload_unknown_phone_error() -> None:
    df = pd.DataFrame([{"phone_number": "999000111", "total": 10}])
    result = parse_manual_marked_scripts_upload(df, phone_to_examiner_id={})
    assert len(result.errors) == 1
    assert "No examiner" in result.errors[0].message
    assert result.items == []


def test_upload_duplicate_phone_error() -> None:
    examiner_id = uuid4()
    phone_map = {"244123456": examiner_id}
    df = pd.DataFrame(
        [
            {"phone_number": "244123456", "total": 10},
            {"phone_number": "244123456", "total": 12},
        ]
    )
    result = parse_manual_marked_scripts_upload(df, phone_to_examiner_id=phone_map)
    assert any("Duplicate phone_number" in e.message for e in result.errors)


def test_upload_blank_total_skipped() -> None:
    examiner_id = uuid4()
    phone_map = {"244123456": examiner_id}
    df = pd.DataFrame([{"phone_number": "244123456", "total": ""}])
    result = parse_manual_marked_scripts_upload(df, phone_to_examiner_id=phone_map)
    assert result.errors == []
    assert result.skipped_count == 1
    assert result.items == [(examiner_id, 0)]


def test_upload_missing_columns_raises() -> None:
    df = pd.DataFrame([{"phone_number": "244123456"}])
    with pytest.raises(ValueError, match="total"):
        parse_manual_marked_scripts_upload(df, phone_to_examiner_id={})
