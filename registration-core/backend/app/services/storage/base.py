"""Base interface for storage backends."""

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    """Abstract base class for storage backends (local, GCS, S3, etc.)."""

    @abstractmethod
    async def save(self, file_content: bytes, filename: str, *args, **kwargs) -> tuple[str, str]:
        """
        Save file content and return (file_path, checksum).

        Args:
            file_content: File content as bytes
            filename: Original filename
            *args: Additional positional arguments
            **kwargs: Additional keyword arguments (backend-specific)

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        pass

    @abstractmethod
    async def retrieve(self, file_path: str) -> bytes:
        """
        Retrieve file content.

        Args:
            file_path: Relative file path (as returned by save)

        Returns:
            File content as bytes

        Raises:
            FileNotFoundError: If file doesn't exist
        """
        pass

    @abstractmethod
    async def delete(self, file_path: str) -> None:
        """
        Delete file.

        Args:
            file_path: Relative file path (as returned by save)
        """
        pass

    @abstractmethod
    async def exists(self, file_path: str) -> bool:
        """
        Check if file exists.

        Args:
            file_path: Relative file path (as returned by save)

        Returns:
            True if file exists, False otherwise
        """
        pass
