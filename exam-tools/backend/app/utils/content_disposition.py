"""HTTP Content-Disposition helpers for file downloads."""

from urllib.parse import quote


def content_disposition_attachment(filename: str) -> str:
    """Build a latin-1-safe Content-Disposition header with UTF-8 filename fallback."""
    ascii_name = filename.encode("ascii", "replace").decode("ascii").replace('"', "'") or "download"
    encoded = quote(filename, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'
