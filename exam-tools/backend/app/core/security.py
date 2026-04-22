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

    Bcrypt has a 72-byte limit. If password exceeds this, hash it with
    SHA-256 first to get a fixed 32-byte digest.
    """
    password_bytes = password.encode("utf-8")
    if len(password_bytes) <= 72:
        return password_bytes
    password_hash = hashlib.sha256(password_bytes).digest()
    return password_hash


def verify_password(plain_password: str, hashed_password: str) -> bool:
    prepared_password = _prepare_password_for_bcrypt(plain_password)
    return bcrypt.checkpw(prepared_password, hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    prepared_password = _prepare_password_for_bcrypt(password)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(prepared_password, salt)
    return hashed.decode("utf-8")


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": int(expire.timestamp())})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None


def create_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    token_bytes = token.encode("utf-8")
    if len(token_bytes) <= 72:
        prepared_token = token_bytes
    else:
        prepared_token = hashlib.sha256(token_bytes).digest()

    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(prepared_token, salt)
    return hashed.decode("utf-8")


def verify_refresh_token_hash(plain_token: str, hashed_token: str) -> bool:
    token_bytes = plain_token.encode("utf-8")
    if len(token_bytes) <= 72:
        prepared_token = token_bytes
    else:
        prepared_token = hashlib.sha256(token_bytes).digest()

    return bcrypt.checkpw(prepared_token, hashed_token.encode("utf-8"))
