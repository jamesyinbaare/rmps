"""Tests for Content-Disposition header helpers."""

from app.utils.content_disposition import content_disposition_attachment


def test_content_disposition_attachment_unicode_filename() -> None:
    header = content_disposition_attachment("2026 MAY — BECE official-statistics CORE.xlsx")
    assert header.startswith('attachment; filename="')
    assert "filename*=UTF-8''" in header
    assert "\u2014" not in header.split('filename="')[1].split('"')[0]


def test_content_disposition_attachment_curly_apostrophe() -> None:
    header = content_disposition_attachment("C001 St. Mary\u2019s School BoG CORE.xlsx")
    ascii_name = header.split('filename="')[1].split('"')[0]
    assert "\u2019" not in ascii_name
    ascii_name.encode("latin-1")
    assert "filename*=UTF-8''" in header
    assert "%E2%80%99" in header
