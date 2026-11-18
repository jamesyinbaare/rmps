"""Factory for creating storage backends."""

import logging
from pathlib import Path

from app.config import settings
from app.services.storage.base import StorageBackend
from app.services.storage.local_backend import LocalStorageBackend
from app.services.storage.gcs_backend import GCSStorageBackend

logger = logging.getLogger(__name__)


def get_storage_backend(
    backend_type: str | None = None,
    base_path: str | Path | None = None,
    **kwargs
) -> StorageBackend:
    """
    Factory function to create storage backend instance.

    Args:
        backend_type: Storage backend type ("local", "gcs"). Defaults to settings.storage_backend
        base_path: Base path for local storage (required for "local" backend)
        **kwargs: Additional backend-specific arguments
            - For "gcs": bucket_name, project_id, credentials_path

    Returns:
        StorageBackend instance

    Raises:
        ValueError: If backend_type is unsupported or required arguments are missing
    """
    backend_type = backend_type or settings.storage_backend

    if backend_type.lower() == "local":
        if base_path is None:
            # Use default from settings
            base_path = settings.storage_path
        return LocalStorageBackend(base_path)

    elif backend_type.lower() == "gcs":
        bucket_name = kwargs.get("bucket_name") or settings.gcs_bucket_name
        if not bucket_name:
            raise ValueError("GCS bucket_name is required for GCS storage backend")

        project_id = kwargs.get("project_id") or settings.gcs_project_id
        credentials_path = kwargs.get("credentials_path") or settings.gcs_credentials_path

        return GCSStorageBackend(
            bucket_name=bucket_name,
            project_id=project_id or None,
            credentials_path=credentials_path or None
        )

    else:
        raise ValueError(f"Unsupported storage backend: {backend_type}. Supported backends: local, gcs")


# Convenience function to get storage backend from settings
def get_default_storage_backend() -> StorageBackend:
    """
    Get storage backend instance configured from settings.

    Returns:
        StorageBackend instance
    """
    return get_storage_backend()
