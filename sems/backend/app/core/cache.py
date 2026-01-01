"""Caching utilities for authentication and user lookups."""
from typing import Any
from uuid import UUID

from cachetools import TTLCache

from app.models import User

# Cache for user lookups by ID (TTL: 5 minutes)
# Max size: 1000 users
user_cache: TTLCache[UUID, User] = TTLCache(maxsize=1000, ttl=300)

# Cache for user lookups by email (TTL: 5 minutes)
# Max size: 1000 users
user_email_cache: TTLCache[str, User] = TTLCache(maxsize=1000, ttl=300)


def get_cached_user(user_id: UUID) -> User | None:
    """Get user from cache by ID."""
    return user_cache.get(user_id)


def set_cached_user(user: User) -> None:
    """Cache a user object by ID and email."""
    user_cache[user.id] = user
    user_email_cache[user.email] = user


def get_cached_user_by_email(email: str) -> User | None:
    """Get user from cache by email."""
    return user_email_cache.get(email)


def invalidate_user_cache(user_id: UUID | None = None, email: str | None = None) -> None:
    """Invalidate cached user data."""
    if user_id and user_id in user_cache:
        user = user_cache.pop(user_id)
        if user and user.email in user_email_cache:
            user_email_cache.pop(user.email)
    if email and email in user_email_cache:
        user = user_email_cache.pop(email)
        if user and user.id in user_cache:
            user_cache.pop(user.id)
