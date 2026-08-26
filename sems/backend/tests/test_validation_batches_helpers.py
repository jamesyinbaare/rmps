"""Unit tests for validation batch clerk helper functions."""

from uuid import uuid4

from app.routers.validation_batches import _primary_active_exam
from app.schemas.validation import ClerkActiveExamItem


def test_primary_active_exam_empty() -> None:
    exam_id, label = _primary_active_exam([])
    assert exam_id is None
    assert label is None


def test_primary_active_exam_returns_first() -> None:
    active = [
        ClerkActiveExamItem(
            exam_id=2,
            exam_label="Exam B",
            assigned_batches=1,
            assigned_pending_issues=5,
        ),
        ClerkActiveExamItem(
            exam_id=1,
            exam_label="Exam A",
            assigned_batches=3,
            assigned_pending_issues=10,
        ),
    ]
    exam_id, label = _primary_active_exam(active)
    assert exam_id == 2
    assert label == "Exam B"


def test_clerk_assign_panel_route_registered() -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    assert "/api/v1/validation/clerks/assign-panel" in paths
