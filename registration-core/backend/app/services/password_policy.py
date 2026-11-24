"""Shared password policy for set-password / change-password flows."""
from __future__ import annotations

import hashlib
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def validate_password_policy(
    password: str,
    *,
    email: str | None = None,
    username: str | None = None,
) -> None:
    """Raise ValueError if password does not meet policy."""
    if len(password) < settings.password_min_length:
        raise ValueError(
            f"Password must be at least {settings.password_min_length} characters long"
        )

    lowered = password.strip().lower()
    if email and lowered == email.strip().lower():
        raise ValueError("Password cannot be the same as your email address")
    if username and lowered == username.strip().lower():
        raise ValueError("Password cannot be the same as your username")

    if settings.password_breach_check_enabled:
        _check_hibp(password)


def _check_hibp(password: str) -> None:
    """Fail closed when HIBP reports the password (k-anonymity range API)."""
    digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    try:
        response = httpx.get(
            f"https://api.pwnedpasswords.com/range/{prefix}",
            timeout=5.0,
            headers={"Add-Padding": "true"},
        )
        response.raise_for_status()
    except Exception as exc:
        logger.warning("HIBP breach check failed: %s", exc)
        raise ValueError("Unable to verify password against breach database. Try again.") from exc

    for line in response.text.splitlines():
        parts = line.split(":")
        if len(parts) != 2:
            continue
        if parts[0].strip().upper() == suffix:
            count = int(parts[1].strip())
            if count >= 3:
                raise ValueError(
                    "This password appears in known data breaches. Choose a different password."
                )
            break
