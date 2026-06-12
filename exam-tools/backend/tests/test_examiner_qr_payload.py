"""Tests for examiner QR payload build/parse."""

from __future__ import annotations

import pytest

from app.services.examiner_qr_payload import build_examiner_qr_payload, parse_examiner_qr_scan


def test_build_examiner_qr_payload() -> None:
    assert build_examiner_qr_payload(42, "math301-nae1") == "42:MATH301-NAE1"


def test_parse_examiner_qr_scan_with_examination_id() -> None:
    assert parse_examiner_qr_scan("42:MATH301-NAE1") == (42, "MATH301-NAE1")


def test_parse_examiner_qr_scan_legacy_plain_code() -> None:
    assert parse_examiner_qr_scan("nae1") == (None, "NAE1")


def test_parse_examiner_qr_scan_empty() -> None:
    assert parse_examiner_qr_scan("  ") == (None, "")


def test_build_rejects_invalid_inputs() -> None:
    with pytest.raises(ValueError, match="positive"):
        build_examiner_qr_payload(0, "NAE1")
    with pytest.raises(ValueError, match="Reference code"):
        build_examiner_qr_payload(1, "  ")
