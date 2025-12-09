import hashlib
import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

import aiofiles

from app.config import settings


class StorageBackend(ABC):
    """Abstract base class for storage backends."""

    @abstractmethod
    async def save(self, file_content: bytes, filename: str) -> tuple[str, str]:
        """
        Save file content and return (file_path, checksum).
        """
        pass

    @abstractmethod
    async def retrieve(self, file_path: str) -> bytes:
        """
        Retrieve file content by path.
        """
        pass

    @abstractmethod
    async def delete(self, file_path: str) -> None:
        """
        Delete file by path.
        """
        pass

    @abstractmethod
    async def exists(self, file_path: str) -> bool:
        """
        Check if file exists.
        """
        pass

    @abstractmethod
    async def get_checksum(self, file_path: str) -> str:
        """
        Calculate and return SHA256 checksum of file.
        """
        pass


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend."""

    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or settings.storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _generate_file_path(self, original_filename: str) -> Path:
        """Generate unique file path using UUID."""
        ext = Path(original_filename).suffix
        unique_filename = f"{uuid.uuid4()}{ext}"
        return self.base_path / unique_filename

    def _resolve_path(self, file_path: str | Path) -> Path:
        """
        Normalize provided paths so we can accept both relative paths (the
        expected format we store) and absolute paths that already include the
        storage base.
        """
        path = Path(file_path)
        return path if path.is_absolute() else self.base_path / path

    def _calculate_checksum(self, content: bytes) -> str:
        """Calculate SHA256 checksum."""
        return hashlib.sha256(content).hexdigest()

    async def save(self, file_content: bytes, filename: str) -> tuple[str, str]:
        """Save file content to local filesystem."""
        file_path = self._generate_file_path(filename)
        checksum = self._calculate_checksum(file_content)

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)

        # Return path relative to base_path for storage
        relative_path = file_path.relative_to(self.base_path)
        return str(relative_path), checksum

    async def retrieve(self, file_path: str) -> bytes:
        """Retrieve file content from local filesystem."""
        full_path = self._resolve_path(file_path)

        # if not await self.exists(str(full_path)):
        #     raise FileNotFoundError(f"File not found: {file_path}")

        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def delete(self, file_path: str) -> None:
        """Delete file from local filesystem."""
        full_path = self._resolve_path(file_path)
        if await self.exists(str(full_path)):
            os.remove(full_path)

    async def exists(self, file_path: str) -> bool:
        """Check if file exists."""
        full_path = self._resolve_path(file_path)
        return full_path.exists()

    async def get_checksum(self, file_path: str) -> str:
        """Calculate checksum of existing file."""
        full_path = self._resolve_path(file_path)
        async with aiofiles.open(full_path, "rb") as f:
            content = await f.read()
        return self._calculate_checksum(content)


class StorageService:
    """Service layer for storage operations."""

    def __init__(self):
        self._backend: StorageBackend | None = None

    def _get_backend(self) -> StorageBackend:
        """Get storage backend based on configuration."""
        if self._backend is None:
            backend_type = settings.storage_backend.lower()
            if backend_type == "local":
                self._backend = LocalStorageBackend()
            else:
                raise ValueError(f"Unsupported storage backend: {backend_type}")
        return self._backend

    async def save(self, file_content: bytes, filename: str) -> tuple[str, str]:
        """Save file and return (file_path, checksum)."""
        return await self._get_backend().save(file_content, filename)

    async def retrieve(self, file_path: str) -> bytes:
        """Retrieve file content."""
        return await self._get_backend().retrieve(file_path)

    async def delete(self, file_path: str) -> None:
        """Delete file."""
        await self._get_backend().delete(file_path)

    async def exists(self, file_path: str) -> bool:
        """Check if file exists."""
        return await self._get_backend().exists(file_path)

    async def get_checksum(self, file_path: str) -> str:
        """Get file checksum."""
        return await self._get_backend().get_checksum(file_path)


# Global storage service instance
storage_service = StorageService()
