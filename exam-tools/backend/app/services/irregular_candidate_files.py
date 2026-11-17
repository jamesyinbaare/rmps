"""Photograph and voucher image storage for irregular examination candidates."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

try:
    from google.cloud.exceptions import NotFound
except ImportError:
    NotFound = Exception  # type: ignore[misc,assignment]

from app.config import settings
from app.services.exam_documents import (
    ExamDocumentUploadError,
    _get_gcs_bucket,
    _guess_content_type,
    is_uuid_stored_object_key,
    normalized_extension,
    read_stored_bytes,
    remove_stored_file,
    storage_base_dir,
    validate_size,
)

IRREGULAR_CANDIDATE_ALLOWED_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp"})
_IRREGULAR_DIR_NAME = "irregular-candidates"

_UNSAFE_FILENAME_CHARS = re.compile(r'[/\\:*?"<>|]+')
_MAX_STORED_PATH_LEN = 512


class IrregularCandidateUploadError(ExamDocumentUploadError):
    """Invalid irregular candidate image upload."""


def irregular_candidate_normalized_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in IRREGULAR_CANDIDATE_ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(IRREGULAR_CANDIDATE_ALLOWED_EXTENSIONS))
        raise IrregularCandidateUploadError(f"File type not allowed. Use one of: {allowed}")
    return normalized_extension(filename)


def _uses_gcs() -> bool:
    return settings.storage_backend.lower() == "gcs"


def _legacy_local_storage_parent() -> Path:
    """Pre-fix root: parent of storage_base_dir (e.g. /app/storage).

    Docker Compose only persists storage_base_dir (/app/storage/documents), so files
    written under the parent were lost on container recreate. Kept for read fallback.
    """
    return storage_base_dir().resolve().parent


def _gcs_object_key(examination_id: int, basename: str) -> str:
    prefix = (settings.gcs_irregular_candidates_prefix or "").strip().strip("/")
    if prefix:
        return f"{prefix}/{examination_id}/{basename}"
    return f"{examination_id}/{basename}"


def _validate_relative_stored_path(stored_path: str) -> Path:
    if not stored_path or stored_path.startswith("/") or "\\" in stored_path:
        raise IrregularCandidateUploadError("Invalid stored path")
    parts = Path(stored_path).parts
    if ".." in parts:
        raise IrregularCandidateUploadError("Invalid stored path")
    if not parts or parts[0] != _IRREGULAR_DIR_NAME:
        raise IrregularCandidateUploadError("Invalid stored path")
    return Path(*parts)


def _candidate_under_root(root: Path, stored_path: str) -> Path:
    rel = _validate_relative_stored_path(stored_path)
    irregular_root = (root / _IRREGULAR_DIR_NAME).resolve()
    candidate = (root / rel).resolve()
    if not str(candidate).startswith(str(irregular_root)) or candidate == irregular_root:
        raise IrregularCandidateUploadError("Invalid stored path")
    return candidate


def _resolve_local_path(stored_path: str) -> Path:
    """Resolve a stored relative path, preferring the persistent documents root."""
    primary = _candidate_under_root(storage_base_dir().resolve(), stored_path)
    if primary.is_file():
        return primary
    legacy = _candidate_under_root(_legacy_local_storage_parent(), stored_path)
    if legacy.is_file():
        return legacy
    # Prefer primary path for error reporting / future writes.
    return primary


def write_irregular_candidate_upload(
    content: bytes,
    examination_id: int,
    *,
    kind: str,
    filename: str,
) -> str:
    ext = irregular_candidate_normalized_extension(filename or f"{kind}.jpg")
    validate_size(content)
    safe_kind = _UNSAFE_FILENAME_CHARS.sub("", kind.strip().lower()) or "image"
    basename = f"{safe_kind}-{uuid.uuid4().hex}{ext}"
    if _uses_gcs():
        key = _gcs_object_key(examination_id, basename)
        if len(key) > _MAX_STORED_PATH_LEN:
            raise IrregularCandidateUploadError("Stored path too long")
        bucket = _get_gcs_bucket()
        blob = bucket.blob(key)
        blob.upload_from_string(content, content_type=_guess_content_type(basename))
        return key
    # Persist under storage_base_dir so Docker volume exam_tools_storage_data keeps files.
    dir_path = storage_base_dir() / _IRREGULAR_DIR_NAME / str(examination_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / basename
    path.write_bytes(content)
    rel = f"{_IRREGULAR_DIR_NAME}/{examination_id}/{basename}"
    if len(rel) > _MAX_STORED_PATH_LEN:
        raise IrregularCandidateUploadError("Stored path too long")
    return rel


def read_irregular_candidate_file_bytes(stored_path: str) -> bytes:
    if is_uuid_stored_object_key(stored_path):
        return read_stored_bytes(stored_path)
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(stored_path)
        try:
            return blob.download_as_bytes()
        except NotFound:
            raise FileNotFoundError(stored_path) from None
    path = _resolve_local_path(stored_path)
    if not path.is_file():
        raise FileNotFoundError(stored_path)
    return path.read_bytes()


def remove_irregular_candidate_file(stored_path: str) -> None:
    if is_uuid_stored_object_key(stored_path):
        remove_stored_file(stored_path)
        return
    if _uses_gcs():
        bucket = _get_gcs_bucket()
        blob = bucket.blob(stored_path)
        try:
            blob.delete()
        except NotFound:
            pass
        return
    # Delete from both roots if present (legacy + current).
    for root in (storage_base_dir().resolve(), _legacy_local_storage_parent()):
        try:
            path = _candidate_under_root(root, stored_path)
        except IrregularCandidateUploadError:
            continue
        if path.is_file():
            path.unlink()
