"""Tests for DATABASE_URL hostname validation in Settings."""

import os
from unittest.mock import patch

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_database_url_postgres_valid_host() -> None:
    with patch.dict(
        os.environ,
        {"DATABASE_URL": "postgresql+asyncpg://user:pass@cloud-sql-proxy:5432/exam_tools_db"},
        clear=False,
    ):
        s = Settings()
        assert "cloud-sql-proxy" in s.database_url


def test_database_url_empty_skips_validation() -> None:
    with patch.dict(os.environ, {"DATABASE_URL": ""}, clear=False):
        s = Settings()
        assert s.database_url == ""


@pytest.mark.parametrize(
    "bad_url",
    [
        "postgresql+asyncpg://u:p@.cloud-sql-proxy:5432/db",
        "postgresql+asyncpg://u:p@cloud-sql-proxy.:5432/db",
        "postgresql+asyncpg://u:p@foo..bar:5432/db",
        "postgresql+asyncpg://u:p@:5432/db",
    ],
)
def test_database_url_rejects_malformed_host(bad_url: str) -> None:
    with patch.dict(os.environ, {"DATABASE_URL": bad_url}, clear=False):
        with pytest.raises(ValidationError) as exc_info:
            Settings()
        assert "DATABASE_URL" in str(exc_info.value) or "hostname" in str(exc_info.value).lower()
