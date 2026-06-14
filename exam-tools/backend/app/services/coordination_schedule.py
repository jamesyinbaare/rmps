"""Coordination period start/end datetime helpers."""

from __future__ import annotations

from datetime import date, datetime, time, timezone


def _as_naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _date_part(dt: datetime | None) -> date | None:
    if dt is None:
        return None
    return dt.date()


def combine_date_and_time(dt: datetime | None, t: time | None, *, end_of_day: bool = False) -> datetime | None:
    """Combine a date column with an optional time; use midnight or end-of-day when time is missing."""
    d = _date_part(_as_naive_utc(dt))
    if d is None:
        return None
    if t is None:
        if end_of_day:
            return datetime.combine(d, time(23, 59, 59))
        return datetime.combine(d, time(0, 0, 0))
    return datetime.combine(d, t.replace(tzinfo=None) if t.tzinfo else t)


def coordination_start_at(
    start_date: datetime | None,
    start_time: time | None,
) -> datetime | None:
    return combine_date_and_time(start_date, start_time, end_of_day=False)


def coordination_end_at(
    end_date: datetime | None,
    end_time: time | None,
) -> datetime | None:
    return combine_date_and_time(end_date, end_time, end_of_day=True)


def validate_coordination_range(
    start_date: datetime | None,
    start_time: time | None,
    end_date: datetime | None,
    end_time: time | None,
) -> None:
    """Raise ValueError when end is before start."""
    start = coordination_start_at(start_date, start_time)
    end = coordination_end_at(end_date, end_time)
    if start is not None and end is not None and end < start:
        raise ValueError("Coordination end must be on or after coordination start.")


def format_coordination_range(
    start_date: datetime | None,
    start_time: time | None,
    end_date: datetime | None,
    end_time: time | None,
) -> str | None:
    """Human-readable coordination range for SMS/PDF."""
    start = coordination_start_at(start_date, start_time)
    end = coordination_end_at(end_date, end_time)
    if start is None and end is None:
        return None
    if start is not None and end is not None:
        if start.date() == end.date():
            start_s = start.strftime("%d %b %Y")
            if start_time or end_time:
                st = start.strftime("%H:%M") if start_time else ""
                et = end.strftime("%H:%M") if end_time else ""
                if st and et:
                    return f"{start_s} {st}–{et}"
                if st:
                    return f"{start_s} from {st}"
            return start_s
        return f"{start.strftime('%d %b %Y')} – {end.strftime('%d %b %Y')}"
    if end is not None:
        return end.strftime("%d %b %Y")
    if start is not None:
        return start.strftime("%d %b %Y")
    return None


def _appointment_letter_date(value: date) -> str:
    """Formal date for appointment letters, e.g. Friday, 20 June 2026."""
    return f"{value.strftime('%A')}, {value.day} {value.strftime('%B %Y')}"


def format_appointment_letter_time(value: time | None) -> str | None:
    """12-hour time for appointment letters, e.g. 10:00am."""
    if value is None:
        return None
    hour = value.hour % 12 or 12
    suffix = "am" if value.hour < 12 else "pm"
    if value.minute == 0:
        return f"{hour}:00{suffix}"
    return f"{hour}:{value.minute:02d}{suffix}"


def format_appointment_letter_coordination_dates(
    start_date: datetime | None,
    end_date: datetime | None,
) -> str | None:
    """Date line for appointment letters: single date or 'start to end'."""
    start_d = _date_part(_as_naive_utc(start_date))
    end_d = _date_part(_as_naive_utc(end_date))
    if start_d is None and end_d is None:
        return None
    if start_d is not None and end_d is not None:
        if start_d == end_d:
            return _appointment_letter_date(start_d)
        return f"{_appointment_letter_date(start_d)} to {_appointment_letter_date(end_d)}"
    if start_d is not None:
        return _appointment_letter_date(start_d)
    if end_d is not None:
        return _appointment_letter_date(end_d)
    return None


def format_appointment_letter_date(value: datetime | None) -> str | None:
    """Single formal date for appointment letters."""
    day = _date_part(_as_naive_utc(value))
    if day is None:
        return None
    return _appointment_letter_date(day)
