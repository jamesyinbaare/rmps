"""Rate limiter: Redis when REDIS_URL is set, otherwise in-process sliding window."""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from threading import Lock

from app.config import settings

logger = logging.getLogger(__name__)

_lock = Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)
_redis_client = None
_redis_failed = False


def _get_redis():
    global _redis_client, _redis_failed
    if _redis_failed or not (settings.redis_url or "").strip():
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        import redis

        _redis_client = redis.Redis.from_url(
            settings.redis_url.strip(),
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
        _redis_client.ping()
        return _redis_client
    except Exception as exc:
        logger.warning("Redis rate limit unavailable, using in-process: %s", exc)
        _redis_failed = True
        _redis_client = None
        return None


def _check_rate_limit_memory(key: str, *, limit: int, window_seconds: int) -> bool:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        bucket = _buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def _check_rate_limit_redis(client, key: str, *, limit: int, window_seconds: int) -> bool:
    """Fixed-window counter via INCR + EXPIRE."""
    redis_key = f"rl:{key}"
    try:
        count = client.incr(redis_key)
        if count == 1:
            client.expire(redis_key, window_seconds)
        return int(count) <= limit
    except Exception as exc:
        logger.warning("Redis rate limit error, falling back: %s", exc)
        return _check_rate_limit_memory(key, limit=limit, window_seconds=window_seconds)


def check_rate_limit(key: str, *, limit: int, window_seconds: int = 60) -> bool:
    """
    Return True if the request is allowed, False if rate-limited.
    """
    if limit <= 0:
        return True
    client = _get_redis()
    if client is not None:
        return _check_rate_limit_redis(client, key, limit=limit, window_seconds=window_seconds)
    return _check_rate_limit_memory(key, limit=limit, window_seconds=window_seconds)
