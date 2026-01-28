"""Security utilities for password hashing and JWT tokens."""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any

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
