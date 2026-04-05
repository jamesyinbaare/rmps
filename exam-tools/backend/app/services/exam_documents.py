import re
import uuid
from pathlib import Path

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


class ExamDocumentUploadError(Exception):
    """Invalid upload (size, extension, etc.)."""


def storage_base_dir() -> Path:
    p = Path(settings.storage_path)
    if not p.is_absolute():
        p = Path.cwd() / p
    return p


def ensure_storage_dir() -> Path:
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


def write_stored_file(content: bytes, extension: str) -> str:
    """Write bytes to a new file; returns stored_path (relative name only)."""
    validate_size(content)
    ensure_storage_dir()
    name = f"{uuid.uuid4().hex}{extension}"
    path = storage_base_dir() / name
    path.write_bytes(content)
    return name


def absolute_stored_path(stored_path: str) -> Path:
    base = storage_base_dir().resolve()
    candidate = (base / stored_path).resolve()
    if not str(candidate).startswith(str(base)) or candidate == base:
        raise ExamDocumentUploadError("Invalid stored path")
    return candidate


def remove_stored_file(stored_path: str) -> None:
    path = absolute_stored_path(stored_path)
    if path.is_file():
        path.unlink()
