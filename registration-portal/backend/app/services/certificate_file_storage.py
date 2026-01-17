"""Service for certificate request file storage operations (photographs and ID scans)."""

import uuid
from pathlib import Path

from app.config import settings
from app.services.storage.factory import get_storage_backend


class CertificateFileStorageService:
    """Service for storing and retrieving certificate request files (photographs and ID scans)."""

    def __init__(self, base_path: str | None = None, backend=None):
        """
        Initialize certificate file storage service.

        Args:
            base_path: Base path for local storage (used when storage_backend is "local")
            backend: Optional storage backend instance (if None, uses factory to get backend)
        """
        self._backend = backend or get_storage_backend(base_path=base_path or settings.certificate_request_storage_path)

    def _get_subdir(self, request_id: int, file_type: str) -> str:
        """Generate subdirectory path for file type."""
        return f"{request_id}/{file_type}"

    async def save_photo(self, file_content: bytes, filename: str, request_id: int) -> tuple[str, str]:
        """
        Save photograph file and return (file_path, checksum).

        Args:
            file_content: Photo file content as bytes
            filename: Original filename
            request_id: Certificate request ID

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        subdir = self._get_subdir(request_id, "photo")
        return await self._backend.save(file_content=file_content, filename=filename, subdir=subdir)

    async def save_id_scan(self, file_content: bytes, filename: str, request_id: int) -> tuple[str, str]:
        """
        Save ID scan file and return (file_path, checksum).

        Args:
            file_content: ID scan file content as bytes
            filename: Original filename
            request_id: Certificate request ID

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        subdir = self._get_subdir(request_id, "id_scan")
        return await self._backend.save(file_content=file_content, filename=filename, subdir=subdir)

    async def save_certificate_scan(self, file_content: bytes, filename: str, request_id: int) -> tuple[str, str]:
        """
        Save certificate scan file and return (file_path, checksum).

        Args:
            file_content: Certificate scan file content as bytes
            filename: Original filename
            request_id: Certificate request ID

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        subdir = self._get_subdir(request_id, "certificate")
        return await self._backend.save(file_content=file_content, filename=filename, subdir=subdir)

    async def save_candidate_photo(self, file_content: bytes, filename: str, request_id: int) -> tuple[str, str]:
        """
        Save candidate photograph file and return (file_path, checksum).

        Args:
            file_content: Candidate photo file content as bytes
            filename: Original filename
            request_id: Certificate request ID

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        subdir = self._get_subdir(request_id, "candidate_photo")
        return await self._backend.save(file_content=file_content, filename=filename, subdir=subdir)

    async def save_pdf(self, file_content: bytes, filename: str, request_id: int) -> tuple[str, str]:
        """
        Save PDF file and return (file_path, checksum).

        Args:
            file_content: PDF file content as bytes
            filename: Original filename
            request_id: Certificate request ID

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        subdir = self._get_subdir(request_id, "pdf")
        return await self._backend.save(file_content=file_content, filename=filename, subdir=subdir)

    async def save_response_file(self, file_content: bytes, filename: str, request_id: int) -> tuple[str, str]:
        """
        Save a response file (admin response) and return (file_path, checksum).

        Stored under "{request_id}/response/".
        """
        subdir = self._get_subdir(request_id, "response")
        return await self._backend.save(file_content=file_content, filename=filename, subdir=subdir)

    async def retrieve(self, file_path: str) -> bytes:
        """Retrieve file content."""
        return await self._backend.retrieve(file_path)

    async def delete(self, file_path: str) -> None:
        """Delete file."""
        await self._backend.delete(file_path)

    async def exists(self, file_path: str) -> bool:
        """Check if file exists."""
        return await self._backend.exists(file_path)
