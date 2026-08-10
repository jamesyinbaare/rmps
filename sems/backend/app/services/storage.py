import asyncio
import hashlib
import os
import uuid
from abc import ABC, abstractmethod
from datetime import timedelta
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

    @abstractmethod
    def allocate_path(self, filename: str) -> str:
        """Allocate a unique relative storage path without writing bytes."""
        pass

    @abstractmethod
    async def save_at_path(
        self,
        file_path: str,
        file_content: bytes,
        *,
        content_type: str | None = None,
    ) -> None:
        """Write bytes to an already-allocated relative path."""
        pass

    @abstractmethod
    async def get_size(self, file_path: str) -> int | None:
        """Return object size in bytes, or None if missing."""
        pass

    @abstractmethod
    async def create_signed_put_url(
        self,
        file_path: str,
        *,
        content_type: str,
        ttl_minutes: int | None = None,
    ) -> str:
        """
        Return a URL the client can PUT bytes to for this path.
        Local backend returns a relative API path; GCS returns a V4 signed URL.
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

    def allocate_path(self, filename: str) -> str:
        file_path = self._generate_file_path(filename)
        return str(file_path.relative_to(self.base_path))

    async def save(self, file_content: bytes, filename: str) -> tuple[str, str]:
        """Save file content to local filesystem."""
        relative = self.allocate_path(filename)
        await self.save_at_path(relative, file_content)
        return relative, self._calculate_checksum(file_content)

    async def save_at_path(
        self,
        file_path: str,
        file_content: bytes,
        *,
        content_type: str | None = None,
    ) -> None:
        full_path = self._resolve_path(file_path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(full_path, "wb") as f:
            await f.write(file_content)

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

    async def get_size(self, file_path: str) -> int | None:
        full_path = self._resolve_path(file_path)
        if not full_path.exists():
            return None
        return full_path.stat().st_size

    async def get_checksum(self, file_path: str) -> str:
        """Calculate checksum of existing file."""
        full_path = self._resolve_path(file_path)
        async with aiofiles.open(full_path, "rb") as f:
            content = await f.read()
        return self._calculate_checksum(content)

    async def create_signed_put_url(
        self,
        file_path: str,
        *,
        content_type: str,
        ttl_minutes: int | None = None,
    ) -> str:
        # Relative path; router resolves document_id → content PUT endpoint.
        # Caller replaces this with the document-scoped API URL.
        _ = (file_path, content_type, ttl_minutes)
        return ""


class GcsStorageBackend(StorageBackend):
    """Google Cloud Storage backend. Stored paths are object key suffixes (relative names)."""

    def __init__(self, prefix: str = ""):
        if gcs_storage is None:
            raise ValueError("google-cloud-storage is not installed")
        if not settings.gcs_bucket_name:
            raise ValueError("GCS bucket not configured (set GCS_BUCKET_NAME)")
        self.prefix = (prefix or "").strip().strip("/")
        self._bucket: Any = None
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            if settings.gcs_credentials_path:
                self._client = gcs_storage.Client.from_service_account_json(
                    settings.gcs_credentials_path,
                    project=settings.gcs_project_id or None,
                )
            else:
                self._client = gcs_storage.Client(project=settings.gcs_project_id or None)
        return self._client

    def _get_bucket(self) -> Any:
        if self._bucket is None:
            self._bucket = self._get_client().bucket(settings.gcs_bucket_name)
        return self._bucket

    def _object_name(self, relative_path: str) -> str:
        name = relative_path.lstrip("/")
        if self.prefix:
            return f"{self.prefix}/{name}"
        return name

    def _generate_relative_name(self, original_filename: str) -> str:
        ext = Path(original_filename).suffix
        return f"{uuid.uuid4()}{ext}"

    def allocate_path(self, filename: str) -> str:
        return self._generate_relative_name(filename)

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
        relative = self.allocate_path(filename)
        checksum = self._calculate_checksum(file_content)
        await self.save_at_path(
            relative,
            file_content,
            content_type=self._guess_content_type(filename),
        )
        return relative, checksum

    async def save_at_path(
        self,
        file_path: str,
        file_content: bytes,
        *,
        content_type: str | None = None,
    ) -> None:
        bucket = self._get_bucket()
        blob = bucket.blob(self._object_name(file_path))
        ctype = content_type or self._guess_content_type(file_path)

        def _upload() -> None:
            blob.upload_from_string(file_content, content_type=ctype)

        await asyncio.to_thread(_upload)

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

    async def get_size(self, file_path: str) -> int | None:
        bucket = self._get_bucket()
        blob = bucket.blob(self._object_name(file_path))

        def _size() -> int | None:
            if not blob.exists():
                return None
            blob.reload()
            return blob.size

        return await asyncio.to_thread(_size)

    async def get_checksum(self, file_path: str) -> str:
        content = await self.retrieve(file_path)
        return self._calculate_checksum(content)

    def _sign_put_url(self, file_path: str, content_type: str, ttl_minutes: int) -> str:
        bucket = self._get_bucket()
        blob = bucket.blob(self._object_name(file_path))
        expiration = timedelta(minutes=ttl_minutes)

        # Prefer private-key signing (SA JSON). Fall back to IAM signBlob via access token
        # for GCE/Cloud Run ADC credentials that lack a local private key.
        try:
            return blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method="PUT",
                content_type=content_type,
            )
        except Exception as key_sign_error:
            import google.auth
            from google.auth.transport import requests as google_auth_requests

            credentials = getattr(self._get_client(), "_credentials", None)
            if credentials is None:
                credentials, _ = google.auth.default()
            if not getattr(credentials, "token", None):
                credentials.refresh(google_auth_requests.Request())

            service_account_email = getattr(credentials, "service_account_email", None)
            if not service_account_email:
                raise RuntimeError(
                    "Cannot sign GCS upload URLs: credentials have no service_account_email. "
                    "Set GCS_CREDENTIALS_PATH to a service-account JSON key, or use a GCE/Cloud Run "
                    "SA with iam.serviceAccounts.signBlob."
                ) from key_sign_error

            try:
                return blob.generate_signed_url(
                    version="v4",
                    expiration=expiration,
                    method="PUT",
                    content_type=content_type,
                    service_account_email=service_account_email,
                    access_token=credentials.token,
                )
            except Exception as iam_sign_error:
                raise RuntimeError(
                    "Failed to generate GCS signed PUT URL via IAM signBlob. "
                    "Grant the runtime SA roles/iam.serviceAccountTokenCreator on itself "
                    f"(or provide GCS_CREDENTIALS_PATH). Underlying error: {iam_sign_error}"
                ) from iam_sign_error

    async def create_signed_put_url(
        self,
        file_path: str,
        *,
        content_type: str,
        ttl_minutes: int | None = None,
    ) -> str:
        ttl = ttl_minutes if ttl_minutes is not None else settings.upload_signed_url_ttl_minutes
        return await asyncio.to_thread(self._sign_put_url, file_path, content_type, ttl)


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

    @property
    def backend_name(self) -> str:
        return settings.storage_backend.lower()

    def allocate_path(self, filename: str) -> str:
        return self._get_backend().allocate_path(filename)

    async def save(self, file_content: bytes, filename: str) -> tuple[str, str]:
        """Save file and return (file_path, checksum)."""
        return await self._get_backend().save(file_content, filename)

    async def save_at_path(
        self,
        file_path: str,
        file_content: bytes,
        *,
        content_type: str | None = None,
    ) -> None:
        await self._get_backend().save_at_path(file_path, file_content, content_type=content_type)

    async def retrieve(self, file_path: str) -> bytes:
        """Retrieve file content."""
        return await self._get_backend().retrieve(file_path)

    async def delete(self, file_path: str) -> None:
        """Delete file."""
        await self._get_backend().delete(file_path)

    async def exists(self, file_path: str) -> bool:
        """Check if file exists."""
        return await self._get_backend().exists(file_path)

    async def get_size(self, file_path: str) -> int | None:
        return await self._get_backend().get_size(file_path)

    async def get_checksum(self, file_path: str) -> str:
        """Get file checksum."""
        return await self._get_backend().get_checksum(file_path)

    async def create_signed_put_url(
        self,
        file_path: str,
        *,
        content_type: str,
        ttl_minutes: int | None = None,
    ) -> str:
        return await self._get_backend().create_signed_put_url(
            file_path,
            content_type=content_type,
            ttl_minutes=ttl_minutes,
        )


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
