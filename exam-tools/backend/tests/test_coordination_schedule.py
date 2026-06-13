"""Tests for coordination schedule formatting."""

from __future__ import annotations

from datetime import datetime, time

from app.services.coordination_schedule import (
    format_appointment_letter_coordination_dates,
    format_appointment_letter_date,
    format_appointment_letter_time,
)


def test_format_appointment_letter_time() -> None:
    assert format_appointment_letter_time(time(10, 0)) == "10:00am"
    assert format_appointment_letter_time(time(16, 30)) == "4:30pm"
    assert format_appointment_letter_time(None) is None


def test_format_appointment_letter_date() -> None:
    assert format_appointment_letter_date(datetime(2026, 7, 1)) == "Wednesday, 1 July 2026"
    assert format_appointment_letter_date(None) is None


def test_format_appointment_letter_coordination_dates_same_day() -> None:
    start = datetime(2026, 6, 20)
    end = datetime(2026, 6, 20)
    assert format_appointment_letter_coordination_dates(start, end) == "Saturday, 20 June 2026"


def test_format_appointment_letter_coordination_dates_range() -> None:
    start = datetime(2026, 6, 9)
    end = datetime(2026, 6, 11)
    assert (
        format_appointment_letter_coordination_dates(start, end)
        == "Tuesday, 9 June 2026 to Thursday, 11 June 2026"
    )


def test_format_appointment_letter_coordination_dates_start_only() -> None:
    start = datetime(2026, 6, 20)
    assert format_appointment_letter_coordination_dates(start, None) == "Saturday, 20 June 2026"
