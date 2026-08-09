"""Caching utilities for authentication and user lookups.

Caches plain attribute snapshots — never live SQLAlchemy ORM instances.
ORM objects become detached/expired when their session closes, which causes
DetachedInstanceError on later attribute access.
"""
from __future__ import annotations

from datetime import datetime
from typing import TypedDict
from uuid import UUID

from cachetools import TTLCache

from app.models import User, UserRole


class UserSnapshot(TypedDict):
    id: UUID
    email: str
    hashed_password: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login: datetime | None


# Cache for user lookups by ID (TTL: 5 minutes)
user_cache: TTLCache[UUID, UserSnapshot] = TTLCache(maxsize=1000, ttl=300)

# Cache for user lookups by email (TTL: 5 minutes)
user_email_cache: TTLCache[str, UserSnapshot] = TTLCache(maxsize=1000, ttl=300)


def _snapshot_user(user: User) -> UserSnapshot:
    """Read column values while the instance is still usable and store a plain dict."""
    return {
        "id": user.id,
        "email": user.email,
        "hashed_password": user.hashed_password,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login": user.last_login,
    }


def _user_from_snapshot(snapshot: UserSnapshot) -> User:
    """Build a transient User that is safe to read outside a session."""
    return User(
        id=snapshot["id"],
        email=snapshot["email"],
        hashed_password=snapshot["hashed_password"],
        full_name=snapshot["full_name"],
        role=snapshot["role"],
        is_active=snapshot["is_active"],
        created_at=snapshot["created_at"],
        updated_at=snapshot["updated_at"],
        last_login=snapshot["last_login"],
    )


def get_cached_user(user_id: UUID) -> User | None:
    """Get a transient user reconstructed from cache by ID."""
    snapshot = user_cache.get(user_id)
    if snapshot is None:
        return None
    return _user_from_snapshot(snapshot)


def set_cached_user(user: User) -> None:
    """Cache a snapshot of user column values by ID and email."""
    snapshot = _snapshot_user(user)
    user_cache[snapshot["id"]] = snapshot
    user_email_cache[snapshot["email"]] = snapshot


def get_cached_user_by_email(email: str) -> User | None:
    """Get a transient user reconstructed from cache by email."""
    snapshot = user_email_cache.get(email)
    if snapshot is None:
        return None
    return _user_from_snapshot(snapshot)


def invalidate_user_cache(user_id: UUID | None = None, email: str | None = None) -> None:
    """Invalidate cached user data."""
    if user_id and user_id in user_cache:
        snapshot = user_cache.pop(user_id)
        cached_email = snapshot.get("email") if snapshot else None
        if cached_email and cached_email in user_email_cache:
            user_email_cache.pop(cached_email, None)
    if email and email in user_email_cache:
        snapshot = user_email_cache.pop(email)
        cached_id = snapshot.get("id") if snapshot else None
        if cached_id and cached_id in user_cache:
            user_cache.pop(cached_id, None)
