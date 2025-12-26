"""Utilities for cache key generation and management."""

import hashlib
import json
from typing import Any


def generate_cache_key(prefix: str, **kwargs: Any) -> str:
    """
    Generate a cache key from a prefix and keyword arguments.

    Args:
        prefix: Cache key prefix (e.g., "validation:issues")
        **kwargs: Key-value pairs to include in the cache key

    Returns:
        A cache key string in the format: prefix:hash(kwargs)
    """
    # Filter out None values and sort for consistent hashing
    filtered_kwargs = {k: v for k, v in sorted(kwargs.items()) if v is not None}

    # Create a deterministic string representation
    key_str = json.dumps(filtered_kwargs, sort_keys=True, default=str)

    # Generate hash for compact key
    key_hash = hashlib.md5(key_str.encode()).hexdigest()

    return f"{prefix}:{key_hash}"


def generate_issues_list_key(
    page: int,
    page_size: int,
    exam_id: int | None = None,
    school_id: int | None = None,
    subject_id: int | None = None,
    status_filter: str | None = None,
    issue_type: str | None = None,
    test_type: int | None = None,
) -> str:
    """
    Generate cache key for validation issues list endpoint.

    Args:
        page: Page number
        page_size: Page size
        exam_id: Optional exam ID filter
        school_id: Optional school ID filter
        subject_id: Optional subject ID filter
        status_filter: Optional status filter
        issue_type: Optional issue type filter
        test_type: Optional test type filter

    Returns:
        Cache key string
    """
    return generate_cache_key(
        "validation:issues",
        page=page,
        page_size=page_size,
        exam_id=exam_id,
        school_id=school_id,
        subject_id=subject_id,
        status_filter=status_filter,
        issue_type=issue_type,
        test_type=test_type,
    )


def generate_issue_detail_key(issue_id: int) -> str:
    """
    Generate cache key for validation issue detail endpoint.

    Args:
        issue_id: Issue ID

    Returns:
        Cache key string
    """
    return f"validation:issue:{issue_id}"


def generate_issues_pattern() -> str:
    """
    Generate a pattern to match all validation issues cache keys.
    Used for cache invalidation.

    Returns:
        Pattern string for matching cache keys
    """
    return "validation:issues:*"


def generate_issue_pattern() -> str:
    """
    Generate a pattern to match all validation issue detail cache keys.
    Used for cache invalidation.

    Returns:
        Pattern string for matching cache keys
    """
    return "validation:issue:*"
