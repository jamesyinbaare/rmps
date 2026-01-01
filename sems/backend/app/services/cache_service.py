"""Cache service for validation issues and other cached data."""

import logging
from abc import ABC, abstractmethod
from typing import Any

from cachetools import TTLCache

from app.config import settings

logger = logging.getLogger(__name__)


class CacheBackend(ABC):
    """Abstract base class for cache backends."""

    @abstractmethod
    async def get(self, key: str) -> Any | None:
        """Get a value from cache by key."""
        pass

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Set a value in cache with optional TTL."""
        pass

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete a value from cache by key."""
        pass

    @abstractmethod
    async def clear_pattern(self, pattern: str) -> None:
        """Clear all keys matching a pattern."""
        pass

    @abstractmethod
    async def clear_all(self) -> None:
        """Clear all cache entries."""
        pass


class InMemoryCacheBackend(CacheBackend):
    """In-memory cache backend using TTLCache."""

    def __init__(self, max_size: int = 1000, ttl: int = 300):
        """
        Initialize in-memory cache.

        Args:
            max_size: Maximum number of items to cache
            ttl: Time to live in seconds
        """
        self.cache: TTLCache[str, Any] = TTLCache(maxsize=max_size, ttl=ttl)
        logger.info(f"Initialized in-memory cache with max_size={max_size}, ttl={ttl}")

    async def get(self, key: str) -> Any | None:
        """Get a value from cache by key."""
        try:
            return self.cache.get(key)
        except Exception as e:
            logger.error(f"Error getting cache key {key}: {e}")
            return None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Set a value in cache with optional TTL."""
        try:
            # Note: TTLCache doesn't support per-item TTL, so we use the default TTL
            # If per-item TTL is needed, we'd need a different cache implementation
            self.cache[key] = value
        except Exception as e:
            logger.error(f"Error setting cache key {key}: {e}")

    async def delete(self, key: str) -> None:
        """Delete a value from cache by key."""
        try:
            self.cache.pop(key, None)
        except Exception as e:
            logger.error(f"Error deleting cache key {key}: {e}")

    async def clear_pattern(self, pattern: str) -> None:
        """Clear all keys matching a pattern."""
        try:
            # For in-memory cache, we need to check all keys
            # Pattern format: "prefix:*"
            prefix = pattern.rstrip("*")
            keys_to_delete = [key for key in self.cache.keys() if key.startswith(prefix)]
            for key in keys_to_delete:
                self.cache.pop(key, None)
            if keys_to_delete:
                logger.info(f"Cleared {len(keys_to_delete)} cache keys matching pattern {pattern}")
        except Exception as e:
            logger.error(f"Error clearing cache pattern {pattern}: {e}")

    async def clear_all(self) -> None:
        """Clear all cache entries."""
        try:
            self.cache.clear()
            logger.info("Cleared all cache entries")
        except Exception as e:
            logger.error(f"Error clearing all cache: {e}")


class CacheService:
    """Service for caching validation issues and other data."""

    def __init__(self):
        """Initialize cache service with configured backend."""
        self._backend: CacheBackend | None = None

    def _get_backend(self) -> CacheBackend:
        """Get cache backend based on configuration."""
        if self._backend is None:
            backend_type = settings.cache_backend.lower()
            if backend_type == "memory":
                max_size = settings.cache_max_size
                ttl = settings.cache_ttl
                self._backend = InMemoryCacheBackend(max_size=max_size, ttl=ttl)
            else:
                raise ValueError(f"Unsupported cache backend: {backend_type}")
        return self._backend

    async def get(self, key: str) -> Any | None:
        """Get a value from cache by key."""
        return await self._get_backend().get(key)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Set a value in cache with optional TTL."""
        await self._get_backend().set(key, value, ttl)

    async def delete(self, key: str) -> None:
        """Delete a value from cache by key."""
        await self._get_backend().delete(key)

    async def clear_pattern(self, pattern: str) -> None:
        """Clear all keys matching a pattern."""
        await self._get_backend().clear_pattern(pattern)

    async def clear_all(self) -> None:
        """Clear all cache entries."""
        await self._get_backend().clear_all()


# Global cache service instance
cache_service = CacheService()
