"""Tests for application settings validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_examiner_invitation_base_url_allows_localhost_in_dev() -> None:
    s = Settings(
        environment="dev",
        examiner_invitation_base_url="http://localhost:3000",
    )
    assert s.examiner_invitation_base_url == "http://localhost:3000"


@pytest.mark.parametrize("environment", ["staging", "production", "prod"])
def test_examiner_invitation_base_url_rejects_localhost_in_non_dev(environment: str) -> None:
    with pytest.raises(ValidationError, match="EXAMINER_INVITATION_BASE_URL"):
        Settings(
            environment=environment,
            examiner_invitation_base_url="http://localhost:3000",
        )


def test_examiner_invitation_base_url_accepts_public_url_in_staging() -> None:
    s = Settings(
        environment="staging",
        examiner_invitation_base_url="https://monitoring.ctvet.gov.gh",
    )
    assert s.examiner_invitation_base_url == "https://monitoring.ctvet.gov.gh"
