import asyncio
import hashlib
import os
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import aiofiles

from app.config import settings

try:
    from google.cloud import storage as gcs_storage
    from google.cloud.exceptions import NotFound
except ImportError:
    gcs_storage = None  # type: ignore[assignment]
    NotFound = Exception  # type: ignore[misc,assignment]


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


class GcsStorageBackend(StorageBackend):
    """Google Cloud Storage backend. Stored paths are object key suffixes (relative names)."""

    def __init__(self, prefix: str = ""):
        if gcs_storage is None:
            raise ValueError("google-cloud-storage is not installed")
        if not settings.gcs_bucket_name:
            raise ValueError("GCS bucket not configured (set GCS_BUCKET_NAME)")
        self.prefix = (prefix or "").strip().strip("/")
        self._bucket: Any = None

    def _get_bucket(self) -> Any:
        if self._bucket is None:
            if settings.gcs_credentials_path:
                client = gcs_storage.Client.from_service_account_json(
                    settings.gcs_credentials_path,
                    project=settings.gcs_project_id or None,
                )
            else:
                client = gcs_storage.Client(project=settings.gcs_project_id or None)
            self._bucket = client.bucket(settings.gcs_bucket_name)
        return self._bucket

    def _object_name(self, relative_path: str) -> str:
        name = relative_path.lstrip("/")
        if self.prefix:
            return f"{self.prefix}/{name}"
        return name

    def _generate_relative_name(self, original_filename: str) -> str:
        ext = Path(original_filename).suffix
        return f"{uuid.uuid4()}{ext}"

    @staticmethod
    def _calculate_checksum(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    def _guess_content_type(filename: str) -> str:
        ext = Path(filename).suffix.lower()
        content_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".pdf": "application/pdf",
            ".csv": "text/csv",
            ".txt": "text/plain",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
        return content_types.get(ext, "application/octet-stream")

    async def save(self, file_content: bytes, filename: str) -> tuple[str, str]:
        relative = self._generate_relative_name(filename)
        checksum = self._calculate_checksum(file_content)
        bucket = self._get_bucket()
        blob = bucket.blob(self._object_name(relative))

        def _upload() -> None:
            blob.upload_from_string(file_content, content_type=self._guess_content_type(filename))

        await asyncio.to_thread(_upload)
        return relative, checksum

    async def retrieve(self, file_path: str) -> bytes:
        bucket = self._get_bucket()
        blob = bucket.blob(self._object_name(file_path))

        def _download() -> bytes:
            try:
                return blob.download_as_bytes()
            except NotFound as exc:
                raise FileNotFoundError(file_path) from exc

        return await asyncio.to_thread(_download)

    async def delete(self, file_path: str) -> None:
        bucket = self._get_bucket()
        blob = bucket.blob(self._object_name(file_path))

        def _delete() -> None:
            try:
                blob.delete()
            except NotFound:
                pass

        await asyncio.to_thread(_delete)

    async def exists(self, file_path: str) -> bool:
        bucket = self._get_bucket()
        blob = bucket.blob(self._object_name(file_path))
        return await asyncio.to_thread(blob.exists)

    async def get_checksum(self, file_path: str) -> str:
        content = await self.retrieve(file_path)
        return self._calculate_checksum(content)


def create_storage_backend(
    *,
    local_base_path: str | None = None,
    gcs_prefix: str | None = None,
) -> StorageBackend:
    """Create a storage backend for the configured STORAGE_BACKEND."""
    backend_type = settings.storage_backend.lower()
    if backend_type == "local":
        return LocalStorageBackend(base_path=local_base_path)
    if backend_type == "gcs":
        prefix = gcs_prefix if gcs_prefix is not None else settings.gcs_documents_prefix
        return GcsStorageBackend(prefix=prefix)
    raise ValueError(f"Unsupported storage backend: {backend_type}")


class StorageService:
    """Service layer for storage operations."""

    def __init__(self, backend: StorageBackend | None = None):
        self._backend = backend

    def _get_backend(self) -> StorageBackend:
        """Get storage backend based on configuration."""
        if self._backend is None:
            self._backend = create_storage_backend(
                local_base_path=settings.storage_path,
                gcs_prefix=settings.gcs_documents_prefix,
            )
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


def create_photo_storage_service() -> StorageService:
    """Storage for candidate photos (local photo path or GCS photos prefix)."""
    return StorageService(
        backend=create_storage_backend(
            local_base_path=settings.photo_storage_path,
            gcs_prefix=settings.gcs_photos_prefix,
        )
    )


# Global storage service instance (documents)
storage_service = StorageService()
