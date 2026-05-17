"""Tests for inspector posting targets from core/elective centre codes."""

import pytest

from app.models import ExamInspectorSubjectScope
from app.services.inspector_posting import inspector_posting_targets_from_codes


def test_both_same_yields_all() -> None:
    assert inspector_posting_targets_from_codes("H001", "H001") == [
        (ExamInspectorSubjectScope.ALL, "H001"),
    ]


def test_both_different_yields_core_elective() -> None:
    assert inspector_posting_targets_from_codes("H001", "H002") == [
        (ExamInspectorSubjectScope.CORE, "H001"),
        (ExamInspectorSubjectScope.ELECTIVE, "H002"),
    ]


def test_core_only() -> None:
    assert inspector_posting_targets_from_codes("H001", None) == [
        (ExamInspectorSubjectScope.CORE, "H001"),
    ]


def test_elective_only() -> None:
    assert inspector_posting_targets_from_codes(None, "H002") == [
        (ExamInspectorSubjectScope.ELECTIVE, "H002"),
    ]


def test_whitespace_stripped() -> None:
    assert inspector_posting_targets_from_codes("  H001 ", " H001") == [
        (ExamInspectorSubjectScope.ALL, "H001"),
    ]


def test_empty_raises() -> None:
    with pytest.raises(ValueError, match="At least one"):
        inspector_posting_targets_from_codes(None, None)
    with pytest.raises(ValueError, match="At least one"):
        inspector_posting_targets_from_codes("", "   ")
