"""Service for photo storage operations."""

import hashlib
import os
import uuid
from pathlib import Path

import aiofiles

from app.config import settings


def calculate_checksum(content: bytes) -> str:
    """Calculate SHA256 checksum of file content."""
    return hashlib.sha256(content).hexdigest()


class PhotoStorageService:
    """Service for storing and retrieving candidate photos."""

    def __init__(self, base_path: str | None = None):
        self.base_path = Path(base_path or settings.photo_storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _generate_file_path(self, candidate_id: int, exam_id: int, original_filename: str, registration_number: str | None = None) -> Path:
        """Generate file path organized by school/exam/candidate."""
        ext = Path(original_filename).suffix or ".jpg"
        # Use registration number if provided, otherwise use UUID
        if registration_number:
            filename = f"{registration_number}{ext}"
        else:
            filename = f"{uuid.uuid4()}{ext}"
        candidate_dir = self.base_path / str(exam_id) / str(candidate_id)
        candidate_dir.mkdir(parents=True, exist_ok=True)
        return candidate_dir / filename

    def _resolve_path(self, file_path: str | Path) -> Path:
        """Resolve file path (accepts both relative and absolute paths)."""
        path = Path(file_path)
        return path if path.is_absolute() else self.base_path / path

    async def save(self, file_content: bytes, filename: str, candidate_id: int, exam_id: int, registration_number: str | None = None) -> tuple[str, str]:
        """
        Save photo file and return (file_path, checksum).

        Args:
            file_content: Photo file content as bytes
            filename: Original filename
            candidate_id: Candidate ID
            exam_id: Exam ID
            registration_number: Optional registration number to use as filename

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        file_path = self._generate_file_path(candidate_id, exam_id, filename, registration_number)
        checksum = calculate_checksum(file_content)

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)

        # Return path relative to base_path for storage
        relative_path = file_path.relative_to(self.base_path)
        return str(relative_path), checksum

    async def retrieve(self, file_path: str) -> bytes:
        """Retrieve photo file content."""
        full_path = self._resolve_path(file_path)
        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def delete(self, file_path: str) -> None:
        """Delete photo file."""
        full_path = self._resolve_path(file_path)
        if await self.exists(file_path):
            os.remove(full_path)

    async def exists(self, file_path: str) -> bool:
        """Check if photo file exists."""
        full_path = self._resolve_path(file_path)
        return full_path.exists()
