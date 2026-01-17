"""Google Cloud Storage backend implementation."""

import hashlib
from pathlib import Path
from typing import Optional

try:
    from google.cloud import storage
    from google.cloud.exceptions import NotFound
except ImportError:
    storage = None
    NotFound = Exception

from app.services.storage.base import StorageBackend


def calculate_checksum(content: bytes) -> str:
    """Calculate SHA256 checksum of file content."""
    return hashlib.sha256(content).hexdigest()


class GCSStorageBackend(StorageBackend):
    """Google Cloud Storage backend."""

    def __init__(self, bucket_name: str, project_id: str | None = None, credentials_path: str | None = None):
        """
        Initialize GCS storage backend.

        Args:
            bucket_name: GCS bucket name
            project_id: GCP project ID (optional, uses default if not provided)
            credentials_path: Path to service account JSON file (optional, uses ADC if not provided)
        """
        if storage is None:
            raise ImportError("google-cloud-storage is not installed. Install it with: pip install google-cloud-storage")

        self.bucket_name = bucket_name

        # Initialize GCS client
        if credentials_path:
            self.client = storage.Client.from_service_account_json(credentials_path, project=project_id)
        else:
            # Use Application Default Credentials (ADC)
            self.client = storage.Client(project=project_id)

        self.bucket = self.client.bucket(bucket_name)

    def _normalize_path(self, file_path: str) -> str:
        """
        Normalize file path for GCS (use forward slashes).

        Args:
            file_path: File path string

        Returns:
            Normalized path with forward slashes
        """
        return str(Path(file_path)).replace("\\", "/")

    async def save(self, file_content: bytes, filename: str, subdir: str | None = None, use_custom_filename: bool = False, *args, **kwargs) -> tuple[str, str]:
        """
        Save file content to GCS.

        Args:
            file_content: File content as bytes
            filename: Original filename (or custom filename if use_custom_filename=True)
            subdir: Optional subdirectory within bucket
            use_custom_filename: If True, use filename as-is; if False, generate UUID filename
            *args: Additional arguments (ignored)
            **kwargs: Additional keyword arguments (ignored)

        Returns:
            Tuple of (relative_file_path, checksum)
        """
        import uuid

        # Generate filename
        if use_custom_filename and filename:
            # Use the provided filename as-is
            final_filename = filename
        else:
            # Generate unique filename
            ext = Path(filename).suffix or ""
            final_filename = f"{uuid.uuid4()}{ext}"

        # Construct blob path
        if subdir:
            blob_path = f"{subdir}/{final_filename}"
        else:
            blob_path = final_filename

        checksum = calculate_checksum(file_content)

        # Upload to GCS
        blob = self.bucket.blob(blob_path)
        blob.upload_from_string(file_content, content_type=self._guess_content_type(filename))

        return blob_path, checksum

    async def retrieve(self, file_path: str) -> bytes:
        """
        Retrieve file content from GCS.

        Args:
            file_path: Relative file path (as returned by save)

        Returns:
            File content as bytes

        Raises:
            FileNotFoundError: If file doesn't exist
        """
        blob_path = self._normalize_path(file_path)
        blob = self.bucket.blob(blob_path)

        try:
            return blob.download_as_bytes()
        except NotFound:
            raise FileNotFoundError(f"File not found in GCS: {blob_path}")

    async def delete(self, file_path: str) -> None:
        """
        Delete file from GCS.

        Args:
            file_path: Relative file path (as returned by save)
        """
        blob_path = self._normalize_path(file_path)
        blob = self.bucket.blob(blob_path)

        try:
            blob.delete()
        except NotFound:
            # File doesn't exist, ignore
            pass

    async def exists(self, file_path: str) -> bool:
        """
        Check if file exists in GCS.

        Args:
            file_path: Relative file path (as returned by save)

        Returns:
            True if file exists, False otherwise
        """
        blob_path = self._normalize_path(file_path)
        blob = self.bucket.blob(blob_path)
        return blob.exists()

    def _guess_content_type(self, filename: str) -> str:
        """
        Guess content type from filename extension.

        Args:
            filename: Filename with extension

        Returns:
            MIME type string
        """
        ext = Path(filename).suffix.lower()
        content_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".pdf": "application/pdf",
            ".csv": "text/csv",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
        return content_types.get(ext, "application/octet-stream")
