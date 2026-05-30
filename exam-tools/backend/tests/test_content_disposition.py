"""Tests for Content-Disposition header helpers."""

from app.utils.content_disposition import content_disposition_attachment


def test_content_disposition_attachment_unicode_filename() -> None:
    header = content_disposition_attachment("2026 MAY — BECE official-statistics CORE.xlsx")
    assert header.startswith('attachment; filename="')
    assert "filename*=UTF-8''" in header
    assert "\u2014" not in header.split('filename="')[1].split('"')[0]
