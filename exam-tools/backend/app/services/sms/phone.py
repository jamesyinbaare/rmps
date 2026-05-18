"""Ghana phone normalization for Nalo msisdn and 10-digit SMS username."""

from __future__ import annotations

import re

_DIGITS_RE = re.compile(r"\D+")


def _digits_only(phone: str) -> str:
    return _DIGITS_RE.sub("", phone.strip())


def normalize_msisdn(phone: str) -> str:
    """International Ghana MSISDN without '+' (e.g. 233551234567)."""
    digits = _digits_only(phone)
    if not digits:
        raise ValueError("phone_number is empty")

    if digits.startswith("233"):
        rest = digits[3:]
        if len(rest) == 9:
            return f"233{rest}"
        if len(rest) > 9:
            return f"233{rest[:9]}"
        raise ValueError("phone_number is not a valid Ghana mobile number")

    if digits.startswith("0") and len(digits) == 10:
        return f"233{digits[1:]}"

    if len(digits) == 9:
        return f"233{digits}"

    raise ValueError("phone_number is not a valid Ghana mobile number")


def format_local_phone_username(phone: str) -> str:
    """10-digit local username for SMS (e.g. 0551234567)."""
    msisdn = normalize_msisdn(phone)
    local = f"0{msisdn[3:]}"
    if len(local) != 10 or not local.startswith("0"):
        raise ValueError("phone_number could not be formatted as a 10-digit username")
    return local
