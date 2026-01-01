import hashlib


def calculate_checksum(content: bytes) -> str:
    """Calculate SHA256 checksum of file content."""
    return hashlib.sha256(content).hexdigest()
