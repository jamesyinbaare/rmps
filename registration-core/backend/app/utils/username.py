"""Username normalization and validation helpers."""
from __future__ import annotations

import re

PRIVATE_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,32}$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def resolve_username(email: str, username: str | None = None) -> str:
    """Return a username; when omitted/blank, use the email address."""
    raw = (username or "").strip().lower()
    if not raw:
        return normalize_email(email)
    return raw


def validate_private_username(username: str) -> str:
    """Validate self-chosen private-candidate usernames (no @)."""
    value = username.strip().lower()
    if not PRIVATE_USERNAME_RE.fullmatch(value):
        raise ValueError(
            "Username must be 3–32 characters and contain only lowercase letters, numbers, and underscores"
        )
    return value
