from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

try:
    from google.cloud import storage
    from google.cloud.exceptions import NotFound
except ImportError:
    storage = None
    NotFound = Exception  # type: ignore[misc,assignment]

from app.config import settings

ALLOWED_EXTENSIONS = frozenset(
    {
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".csv",
        ".txt",
        ".ppt",
        ".pptx",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
    }
)

_EXT_RE = re.compile(r"^\.[a-z0-9]{1,12}$")
# stored_path in DB: uuid32hex + extension (from write_stored_file)
_STORED_NAME_RE = re.compile(r"^[a-f0-9]{32}(\.[a-z0-9]{1,12})$")

_gcs_bucket: Any = None


class ExamDocumentUploadError(Exception):
    """Invalid upload (size, extension, etc.)."""


def _uses_gcs() -> bool:
    return settings.storage_backend.lower() == "gcs"


def storage_base_dir() -> Path:
    p = Path(settings.storage_path)
    if not p.is_absolute():
        p = Path.cwd() / p
    return p


def ensure_storage_dir() -> Path:
    if _uses_gcs():
        return storage_base_dir()
    base = storage_base_dir()
    base.mkdir(parents=True, exist_ok=True)
    return base


def normalized_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if not suffix or suffix not in ALLOWED_EXTENSIONS or not _EXT_RE.match(suffix):
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ExamDocumentUploadError(f"File type not allowed. Use one of: {allowed}")
    return suffix


def validate_size(content: bytes) -> None:
    if len(content) > settings.storage_max_size:
        mb = settings.storage_max_size // (1024 * 1024)
        raise ExamDocumentUploadError(f"File too large (max {mb}MB)")


def _assert_safe_stored_name(stored_name: str) -> None:
    if not _STORED_NAME_RE.match(stored_name.lower()):
        raise ExamDocumentUploadError("Invalid stored path")


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
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
    return content_types.get(ext, "application/octet-stream")


def _get_gcs_bucket() -> Any:
    global _gcs_bucket
    if storage is None:
        raise ExamDocumentUploadError("google-cloud-storage is not installed")
    if not settings.gcs_bucket_name:
        raise ExamDocumentUploadError("GCS bucket not configured (set GCS_BUCKET_NAME)")
    if _gcs_bucket is None:
        if settings.gcs_credentials_path:
            client = storage.Client.from_service_account_json(
                settings.gcs_credentials_path,
                project=settings.gcs_project_id or None,
            )
        else:
            client = storage.Client(project=settings.gcs_project_id or None)
        _gcs_bucket = client.bucket(settings.gcs_bucket_name)
    return _gcs_bucket


def _gcs_object_name(stored_name: str) -> str:
    _assert_safe_stored_name(stored_name)
    prefix = (settings.gcs_documents_prefix or "").strip().strip("/")
    if prefix:
        return f"{prefix}/{stored_name}"
    return stored_name


def write_stored_file(content: bytes, extension: str) -> str:
    """Write bytes to a new file or GCS object; returns stored_path (object key suffix / filename only)."""
    validate_size(content)
    name = f"{uuid.uuid4().hex}{extension}"
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(_gcs_object_name(name))
        blob.upload_from_string(content, content_type=_guess_content_type(f"file{extension}"))
        return name
    ensure_storage_dir()
    path = storage_base_dir() / name
    path.write_bytes(content)
    return name


def read_stored_bytes(stored_path: str) -> bytes:
    """Load document bytes from local disk or GCS."""
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(_gcs_object_name(stored_path))
        try:
            return blob.download_as_bytes()
        except NotFound:
            raise FileNotFoundError(stored_path)
    path = absolute_stored_path(stored_path)
    if not path.is_file():
        raise FileNotFoundError(stored_path)
    return path.read_bytes()


def absolute_stored_path(stored_path: str) -> Path:
    base = storage_base_dir().resolve()
    _assert_safe_stored_name(stored_path)
    candidate = (base / stored_path).resolve()
    if not str(candidate).startswith(str(base)) or candidate == base:
        raise ExamDocumentUploadError("Invalid stored path")
    return candidate


def remove_stored_file(stored_path: str) -> None:
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(_gcs_object_name(stored_path))
        try:
            blob.delete()
        except NotFound:
            pass
        return
    path = absolute_stored_path(stored_path)
    if path.is_file():
        path.unlink()
