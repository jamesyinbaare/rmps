"""Rate limiter for Reducto API requests using token bucket algorithm."""
import asyncio
import logging
import time

logger = logging.getLogger(__name__)


class ReductoRateLimiter:
    """Token bucket rate limiter for Reducto API requests.

    This rate limiter uses a token bucket algorithm to throttle API requests.
    Tokens are replenished at a constant rate, allowing bursts up to the bucket
    capacity while maintaining an average rate over time.
    """

    def __init__(self, rate_per_second: float):
        """
        Initialize the rate limiter.

        Args:
            rate_per_second: Maximum number of requests per second. Must be > 0.
        """
        if rate_per_second <= 0:
            raise ValueError("rate_per_second must be greater than 0")

        self.rate = rate_per_second
        self.tokens = rate_per_second  # Start with full bucket
        self.capacity = rate_per_second  # Bucket capacity equals rate for smooth limiting
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """
        Acquire a token, waiting if necessary.

        This method will wait until a token is available before returning.
        If the rate limit is 0, this will block indefinitely.
        """
        while True:
            async with self._lock:
                # Replenish tokens based on elapsed time
                now = time.monotonic()
                elapsed = now - self.last_update

                # Add tokens based on elapsed time (proportional to rate)
                new_tokens = elapsed * self.rate
                self.tokens = min(self.capacity, self.tokens + new_tokens)
                self.last_update = now

                # If we have a token, consume it immediately and return
                if self.tokens >= 1.0:
                    self.tokens -= 1.0
                    return

                # Otherwise, calculate how long to wait
                tokens_needed = 1.0 - self.tokens
                wait_time = tokens_needed / self.rate

            # Release lock while waiting
            await asyncio.sleep(wait_time)
            # Loop will reacquire lock and check again

    async def get_available_tokens(self) -> float:
        """
        Get the current number of available tokens without waiting.

        Returns:
            Number of available tokens (may be fractional).
        """
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update

            # Replenish tokens based on elapsed time
            new_tokens = elapsed * self.rate
            available = min(self.capacity, self.tokens + new_tokens)

            return available
