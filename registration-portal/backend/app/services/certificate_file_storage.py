"""Service for certificate request file storage operations (photographs and ID scans)."""

import hashlib
import os
import uuid
from pathlib import Path

import aiofiles

from app.config import settings


def calculate_checksum(content: bytes) -> str:
    """Calculate SHA256 checksum of file content."""
    return hashlib.sha256(content).hexdigest()


class CertificateFileStorageService:
    """Service for storing and retrieving certificate request files (photographs and ID scans)."""

    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or settings.certificate_request_storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _generate_file_path(self, request_id: int, file_type: str, original_filename: str) -> Path:
        """Generate file path organized by request ID and file type."""
        ext = Path(original_filename).suffix or ".jpg"
        filename = f"{uuid.uuid4()}{ext}"
        file_type_dir = self.base_path / str(request_id) / file_type  # file_type: 'photo' or 'id_scan'
        file_type_dir.mkdir(parents=True, exist_ok=True)
        return file_type_dir / filename

    def _resolve_path(self, file_path: str | Path) -> Path:
        """Resolve file path (accepts both relative and absolute paths)."""
        path = Path(file_path)
        return path if path.is_absolute() else self.base_path / path

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
        file_path = self._generate_file_path(request_id, "photo", filename)
        checksum = calculate_checksum(file_content)

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)

        # Return path relative to base_path for storage
        relative_path = file_path.relative_to(self.base_path)
        return str(relative_path), checksum

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
        file_path = self._generate_file_path(request_id, "id_scan", filename)
        checksum = calculate_checksum(file_content)

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)

        # Return path relative to base_path for storage
        relative_path = file_path.relative_to(self.base_path)
        return str(relative_path), checksum

    async def retrieve(self, file_path: str) -> bytes:
        """Retrieve file content."""
        full_path = self._resolve_path(file_path)
        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def delete(self, file_path: str) -> None:
        """Delete file."""
        full_path = self._resolve_path(file_path)
        if await self.exists(file_path):
            os.remove(full_path)

    async def exists(self, file_path: str) -> bool:
        """Check if file exists."""
        full_path = self._resolve_path(file_path)
        return full_path.exists()
