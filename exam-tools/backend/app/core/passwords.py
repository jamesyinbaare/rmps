"""Password generation helpers."""

from __future__ import annotations

import secrets
import string

_LOWER = string.ascii_lowercase
_UPPER = string.ascii_uppercase
_DIGITS = string.digits
_INSPECTOR_CHARSET = _LOWER + _UPPER + _DIGITS


def generate_inspector_password(length: int = 8) -> str:
    """Generate a random password with at least one lower, upper, and digit."""
    if length < 3:
        raise ValueError("length must be at least 3 to include lower, upper, and digit")

    chars = [
        secrets.choice(_LOWER),
        secrets.choice(_UPPER),
        secrets.choice(_DIGITS),
    ]
    chars.extend(secrets.choice(_INSPECTOR_CHARSET) for _ in range(length - 3))
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)
