"""Service for photo storage operations."""

import hashlib
import uuid
from pathlib import Path

from app.config import settings
from app.services.storage.factory import get_storage_backend


def calculate_checksum(content: bytes) -> str:
    """Calculate SHA256 checksum of file content."""
    return hashlib.sha256(content).hexdigest()


class PhotoStorageService:
    """Service for storing and retrieving candidate photos."""

    def __init__(self, base_path: str | None = None, backend=None):
        """
        Initialize photo storage service.

        Args:
            base_path: Base path for local storage (used when storage_backend is "local")
            backend: Optional storage backend instance (if None, uses factory to get backend)
        """
        self._backend = backend or get_storage_backend(base_path=base_path or settings.photo_storage_path)

    def _generate_file_path(self, candidate_id: int, exam_id: int, original_filename: str, registration_number: str | None = None) -> str:
        """Generate relative file path organized by school/exam/candidate."""
        ext = Path(original_filename).suffix or ".jpg"
        # Use registration number if provided, otherwise use UUID
        if registration_number:
            filename = f"{registration_number}{ext}"
        else:
            filename = f"{uuid.uuid4()}{ext}"
        # Generate path relative to storage root
        subdir = f"{exam_id}/{candidate_id}"
        return f"{subdir}/{filename}"

    async def save(self, file_content: bytes, filename: str, candidate_id: int, exam_id: int, registration_number: str | None = None) -> tuple[str, str]:
        """
        Save photo file and return (file_path, checksum).

        Args:
            file_content: Photo file content as bytes
            filename: Original filename (may already include registration_number if passed from router)
            candidate_id: Candidate ID
            exam_id: Exam ID
            registration_number: Optional registration number to use as filename (if not already in filename)

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        # Generate subdirectory path
        subdir = f"{exam_id}/{candidate_id}"

        # Determine if we should use custom filename (if registration_number is provided and filename matches it)
        use_custom_filename = False
        if registration_number:
            # Check if filename already contains registration_number (passed from router)
            ext = Path(filename).suffix or ".jpg"
            expected_filename = f"{registration_number}{ext}"
            if filename == expected_filename or registration_number in filename:
                use_custom_filename = True

        # Use storage backend to save
        file_path, checksum = await self._backend.save(
            file_content=file_content,
            filename=filename,
            subdir=subdir,
            use_custom_filename=use_custom_filename
        )

        return file_path, checksum

    async def retrieve(self, file_path: str) -> bytes:
        """Retrieve photo file content."""
        return await self._backend.retrieve(file_path)

    async def delete(self, file_path: str) -> None:
        """Delete photo file."""
        await self._backend.delete(file_path)

    async def exists(self, file_path: str) -> bool:
        """Check if photo file exists."""
        return await self._backend.exists(file_path)
