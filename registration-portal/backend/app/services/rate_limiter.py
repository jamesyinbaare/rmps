"""Rate limiting service for API keys."""
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Tuple
from uuid import UUID

from fastapi import HTTPException, status


class RateLimiter:
    """In-memory rate limiter using sliding window approach."""

    def __init__(self):
        # Store request timestamps per API key
        # Format: {api_key_id: [timestamp1, timestamp2, ...]}
        self._requests: Dict[UUID, list[datetime]] = {}
        # Store rate limits per API key
        self._rate_limits: Dict[UUID, int] = {}
        # Store reset times per API key
        self._reset_times: Dict[UUID, datetime] = {}

    def _cleanup_old_requests(self, api_key_id: UUID, window_minutes: int):
        """Remove requests outside the time window."""
        if api_key_id not in self._requests:
            return

        cutoff = datetime.utcnow() - timedelta(minutes=window_minutes)
        self._requests[api_key_id] = [
            ts for ts in self._requests[api_key_id] if ts > cutoff
        ]

    def check_rate_limit(
        self,
        api_key_id: UUID,
        rate_limit_per_minute: int,
        reset_at: datetime | None = None,
    ) -> Tuple[bool, int]:
        """
        Check if request is within rate limit.

        Args:
            api_key_id: API key ID
            rate_limit_per_minute: Rate limit per minute
            reset_at: When to reset the counter (from database)

        Returns:
            Tuple of (is_allowed, remaining_requests)
        """
        now = datetime.utcnow()

        # Clean up old requests
        self._cleanup_old_requests(api_key_id, 1)  # 1 minute window

        # Check if we need to reset based on database reset_at time
        if reset_at and now >= reset_at:
            # Reset if database says so
            if api_key_id in self._requests:
                del self._requests[api_key_id]

        # Initialize if needed
        if api_key_id not in self._requests:
            self._requests[api_key_id] = []
            self._rate_limits[api_key_id] = rate_limit_per_minute

        # Count requests in the last minute
        request_count = len(self._requests[api_key_id])

        # Check if limit exceeded
        if request_count >= rate_limit_per_minute:
            remaining = 0
            return False, remaining

        # Add current request
        self._requests[api_key_id].append(now)
        remaining = rate_limit_per_minute - (request_count + 1)

        return True, remaining

    def get_remaining_requests(self, api_key_id: UUID, rate_limit_per_minute: int) -> int:
        """Get remaining requests for an API key."""
        self._cleanup_old_requests(api_key_id, 1)

        if api_key_id not in self._requests:
            return rate_limit_per_minute

        request_count = len(self._requests[api_key_id])
        return max(0, rate_limit_per_minute - request_count)


# Global rate limiter instance
rate_limiter = RateLimiter()
