"""Local filesystem storage backend implementation."""

import hashlib
import os
import uuid
from pathlib import Path

import aiofiles

from app.services.storage.base import StorageBackend


def calculate_checksum(content: bytes) -> str:
    """Calculate SHA256 checksum of file content."""
    return hashlib.sha256(content).hexdigest()


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend."""

    def __init__(self, base_path: str | Path):
        """
        Initialize local storage backend.

        Args:
            base_path: Base directory path for storage
        """
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _generate_file_path(self, original_filename: str, subdir: str | None = None, use_custom_filename: bool = False) -> Path:
        """Generate file path using custom filename or UUID."""
        ext = Path(original_filename).suffix or ""
        if use_custom_filename and original_filename:
            # Use the provided filename as-is (already includes extension if needed)
            filename = original_filename
        else:
            # Generate UUID-based filename
            filename = f"{uuid.uuid4()}{ext}"
        if subdir:
            file_dir = self.base_path / subdir
            file_dir.mkdir(parents=True, exist_ok=True)
            return file_dir / filename
        return self.base_path / filename

    def _resolve_path(self, file_path: str | Path) -> Path:
        """
        Resolve file path (accepts both relative and absolute paths).

        Args:
            file_path: Relative or absolute file path

        Returns:
            Resolved Path object
        """
        path = Path(file_path)
        return path if path.is_absolute() else self.base_path / path

    async def save(self, file_content: bytes, filename: str, subdir: str | None = None, use_custom_filename: bool = False, *args, **kwargs) -> tuple[str, str]:
        """
        Save file content to local filesystem.

        Args:
            file_content: File content as bytes
            filename: Original filename (or custom filename if use_custom_filename=True)
            subdir: Optional subdirectory within base_path
            use_custom_filename: If True, use filename as-is; if False, generate UUID filename
            *args: Additional arguments (ignored)
            **kwargs: Additional keyword arguments (ignored)

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        file_path = self._generate_file_path(filename, subdir, use_custom_filename=use_custom_filename)
        checksum = calculate_checksum(file_content)

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)

        # Return path relative to base_path for storage
        relative_path = file_path.relative_to(self.base_path)
        return str(relative_path), checksum

    async def retrieve(self, file_path: str) -> bytes:
        """
        Retrieve file content from local filesystem.

        Args:
            file_path: Relative file path (as returned by save)

        Returns:
            File content as bytes

        Raises:
            FileNotFoundError: If file doesn't exist
        """
        full_path = self._resolve_path(file_path)
        async with aiofiles.open(full_path, "rb") as f:
            return await f.read()

    async def delete(self, file_path: str) -> None:
        """
        Delete file from local filesystem.

        Args:
            file_path: Relative file path (as returned by save)
        """
        full_path = self._resolve_path(file_path)
        if await self.exists(file_path):
            os.remove(full_path)

    async def exists(self, file_path: str) -> bool:
        """
        Check if file exists in local filesystem.

        Args:
            file_path: Relative file path (as returned by save)

        Returns:
            True if file exists, False otherwise
        """
        full_path = self._resolve_path(file_path)
        return full_path.exists()
