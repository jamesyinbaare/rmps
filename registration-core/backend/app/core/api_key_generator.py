"""API key generation utilities."""
import secrets
from app.core.security import hash_refresh_token


def generate_api_key() -> tuple[str, str]:
    """
    Generate a secure API key.

    Returns:
        Tuple of (full_key, key_prefix)
        - full_key: The complete API key (e.g., ctvet_abc123...)
        - key_prefix: First 8 characters for display (e.g., ctvet_ab)
    """
    # Generate 32 bytes of random data (URL-safe base64)
    random_bytes = secrets.token_urlsafe(32)

    # Format: ctvet_<random_base64>
    full_key = f"ctvet_{random_bytes}"

    # Extract prefix (first 8 characters after "ctvet_")
    key_prefix = full_key[:15]  # "ctvet_" (6) + 9 chars = 15 total

    return full_key, key_prefix


def hash_api_key(key: str) -> str:
    """
    Hash an API key using the same method as refresh tokens.

    Args:
        key: The plain API key

    Returns:
        Hashed API key
    """
    return hash_refresh_token(key)
