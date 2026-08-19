"""Normalize OCR-noisy candidate index numbers (digit strings)."""

from __future__ import annotations

import re
from typing import Any

MIN_INDEX_DIGITS = 6

_HOMOGLYPHS = str.maketrans(
    {
        "O": "0",
        "o": "0",
        "I": "1",
        "l": "1",
        "L": "1",
    }
)

_DIGIT_RUN = re.compile(r"\d+")


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        text = str(value)
        if re.fullmatch(r"\d+\.0+", text):
            return text.split(".", 1)[0]
        return text
    if isinstance(value, int):
        return str(value)
    return str(value).strip()


def normalize_index_number(value: Any, *, min_digits: int = MIN_INDEX_DIGITS) -> str | None:
    """Return digits-only index suitable for lookup, or None if too short."""
    text = _as_text(value)
    if not text:
        return None

    if re.fullmatch(r"\d+\.0+", text):
        text = text.split(".", 1)[0]

    translated = text.translate(_HOMOGLYPHS)
    digits = "".join(ch for ch in translated if ch.isdigit())
    if len(digits) < min_digits:
        runs = _DIGIT_RUN.findall(translated)
        longest = max(runs, key=len) if runs else ""
        digits = longest if len(longest) >= min_digits else digits
    if len(digits) < min_digits:
        return None
    return digits


def index_noise_chars(raw: Any, cleaned: str | None) -> str:
    """Characters present in the raw value that are not in the cleaned digits."""
    text = _as_text(raw)
    if not text:
        return ""
    if not cleaned:
        return "".join(ch for ch in text if not ch.isdigit() and not ch.isspace())
    remaining = list(cleaned)
    noise: list[str] = []
    for ch in text:
        mapped = ch.translate(_HOMOGLYPHS)
        if remaining and mapped == remaining[0]:
            remaining.pop(0)
            continue
        if ch.isspace():
            continue
        noise.append(ch)
    return "".join(noise)


def highlight_index_parts(raw: Any, cleaned: str | None) -> list[tuple[str, bool]]:
    """Split raw index into (chunk, is_noise) parts for UI highlighting."""
    text = _as_text(raw)
    if not text:
        return []
    remaining = list(cleaned or "")
    parts: list[tuple[str, bool]] = []
    buf = ""
    buf_noise: bool | None = None

    def flush() -> None:
        nonlocal buf, buf_noise
        if buf and buf_noise is not None:
            parts.append((buf, buf_noise))
        buf = ""
        buf_noise = None

    for ch in text:
        mapped = ch.translate(_HOMOGLYPHS)
        is_kept = bool(remaining) and mapped == remaining[0]
        if is_kept:
            remaining.pop(0)
        is_noise = not is_kept
        if buf_noise is None:
            buf_noise = is_noise
            buf = ch
        elif buf_noise == is_noise:
            buf += ch
        else:
            flush()
            buf_noise = is_noise
            buf = ch
    flush()
    return parts


def filter_index_matches(
    cleaned: str,
    rows: list[tuple[int, str, str, str | None]],
) -> list[tuple[int, str, str, str | None]]:
    """Return exact matches, else unique prefix/suffix matches.

    Each row is (subject_registration_id, index_number, candidate_name, school_name).
    """
    exact = [row for row in rows if row[1] == cleaned]
    if exact:
        return exact
    fuzzy = [
        row
        for row in rows
        if row[1].endswith(cleaned)
        or cleaned.endswith(row[1])
        or row[1].startswith(cleaned)
        or cleaned.startswith(row[1])
    ]
    if len(fuzzy) == 1:
        return fuzzy
    return fuzzy
