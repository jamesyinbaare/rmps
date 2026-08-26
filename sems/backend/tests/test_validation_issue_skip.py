"""Unit tests for validation issue skip status helpers."""

from app.models import ValidationIssueStatus
from app.schemas.validation import ValidationIssueStatus as SchemaStatus


def test_skipped_status_exists_on_model_and_schema() -> None:
    assert ValidationIssueStatus.SKIPPED.value == "skipped"
    assert SchemaStatus.SKIPPED.value == "skipped"


def test_skip_route_registered() -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    paths = {
        (getattr(route, "path", None), tuple(getattr(route, "methods", set()) or ()))
        for route in app.routes
    }
    assert ("/api/v1/validation/issues/{issue_id}/skip", ("PUT",)) in {
        (path, methods) for path, methods in paths if path
    } or any(
        getattr(route, "path", None) == "/api/v1/validation/issues/{issue_id}/skip"
        and "PUT" in (getattr(route, "methods", set()) or set())
        for route in app.routes
    )
