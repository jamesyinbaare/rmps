from datetime import datetime, timedelta
from typing import Any
import hashlib
import secrets

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def _prepare_password_for_bcrypt(password: str) -> bytes:
    """
    Prepare password for bcrypt hashing.

    Bcrypt has a 72-byte limit. If password exceeds this, we hash it with
    SHA-256 first to get a fixed 32-byte digest.
    This ensures passwords of any length can be hashed securely.
    """
    password_bytes = password.encode("utf-8")
    if len(password_bytes) <= 72:
        # Password fits, use it directly
        return password_bytes
    # Password too long, hash it first (SHA-256 produces 32 bytes)
    password_hash = hashlib.sha256(password_bytes).digest()
    # 32 bytes is well under 72-byte limit
    return password_hash


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    # Prepare the password the same way it was hashed
    prepared_password = _prepare_password_for_bcrypt(plain_password)
    # Verify using bcrypt directly
    return bcrypt.checkpw(prepared_password, hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    # Prepare password to fit bcrypt's 72-byte limit
    prepared_password = _prepare_password_for_bcrypt(password)
    # Hash using bcrypt directly
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(prepared_password, salt)
    return hashed.decode("utf-8")


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    # JWT exp claim must be a Unix timestamp (integer), not a datetime object
    to_encode.update({"exp": int(expire.timestamp())})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str) -> dict[str, Any] | None:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None


def create_refresh_token() -> str:
    """Generate a secure random refresh token."""
    # Generate a URL-safe random token (32 bytes = 43 characters when base64 encoded)
    return secrets.token_urlsafe(32)


def refresh_token_lookup_hash(token: str) -> str:
    """HMAC-SHA256 lookup key for O(1) refresh token retrieval."""
    return hashlib.sha256(
        f"{settings.secret_key}:refresh:{token}".encode("utf-8")
    ).hexdigest()


def hash_refresh_token(token: str) -> str:
    """Hash a refresh token using bcrypt before storage."""
    # Prepare token for bcrypt (same approach as passwords)
    token_bytes = token.encode("utf-8")
    if len(token_bytes) <= 72:
        prepared_token = token_bytes
    else:
        # Token too long, hash it first
        prepared_token = hashlib.sha256(token_bytes).digest()

    # Hash using bcrypt
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(prepared_token, salt)
    return hashed.decode("utf-8")


def verify_refresh_token_hash(plain_token: str, hashed_token: str) -> bool:
    """Verify a plain refresh token against a hashed token."""
    # Prepare the token the same way it was hashed
    token_bytes = plain_token.encode("utf-8")
    if len(token_bytes) <= 72:
        prepared_token = token_bytes
    else:
        prepared_token = hashlib.sha256(token_bytes).digest()

    # Verify using bcrypt
    return bcrypt.checkpw(prepared_token, hashed_token.encode("utf-8"))


DEFAULT_SECRET_KEY = "registration-core-secret-key-change-in-production"
DEV_ENVIRONMENTS = {"dev", "development", "local", "test"}


def is_development_environment(environment: str | None = None) -> bool:
    env = (environment if environment is not None else settings.environment).strip().lower()
    return env in DEV_ENVIRONMENTS


def assert_secret_key_safe_for_boot() -> None:
    """Refuse to start outside development when SECRET_KEY is missing/default."""
    if is_development_environment():
        return
    key = (settings.secret_key or "").strip()
    if not key or key == DEFAULT_SECRET_KEY:
        raise RuntimeError(
            "SECRET_KEY must be set to a strong random value outside development. "
            "Refusing to start with the default or empty key."
        )


def system_admin_provisioning_allowed() -> bool:
    if settings.allow_system_admin_provisioning is not None:
        return bool(settings.allow_system_admin_provisioning)
    return is_development_environment()
