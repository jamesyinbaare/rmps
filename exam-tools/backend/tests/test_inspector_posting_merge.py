"""Tests for posted inspector merge/sort display helpers."""

from uuid import uuid4

from app.schemas.examination import ExecutivePostedInspectorItem
from app.schemas.school import PostedInspectorAtCentreRow
from app.services.inspector_posting_display import (
    merge_centre_posted_inspectors,
    merge_executive_posted_inspectors,
    merge_subject_scopes,
    normalize_subject_scope,
)


def test_normalize_subject_scope_unknown_defaults_all() -> None:
    assert normalize_subject_scope("weird") == "ALL"


def test_merge_subject_scopes_core_elective_becomes_all() -> None:
    assert merge_subject_scopes("CORE", "ELECTIVE") == "ALL"
    assert merge_subject_scopes("ELECTIVE", "CORE") == "ALL"


def test_merge_executive_posted_inspectors_collapses_duplicate_identity() -> None:
    pid_core = uuid4()
    pid_elect = uuid4()
    rows = [
        ExecutivePostedInspectorItem(
            posting_id=pid_elect,
            inspector_full_name="Jane Doe",
            inspector_phone_number="0244123456",
            subject_scope="ELECTIVE",
        ),
        ExecutivePostedInspectorItem(
            posting_id=pid_core,
            inspector_full_name="Jane Doe",
            inspector_phone_number="0244123456",
            subject_scope="CORE",
        ),
    ]
    merged = merge_executive_posted_inspectors(rows)
    assert len(merged) == 1
    assert merged[0].subject_scope == "ALL"
    assert merged[0].inspector_full_name == "Jane Doe"


def test_merge_centre_posted_inspectors_sorts_by_scope_then_name() -> None:
    rows = [
        PostedInspectorAtCentreRow(
            posting_id=uuid4(),
            examination_id=1,
            inspector_user_id=uuid4(),
            inspector_full_name="Zed",
            inspector_phone=None,
            subject_scope="ELECTIVE",
        ),
        PostedInspectorAtCentreRow(
            posting_id=uuid4(),
            examination_id=1,
            inspector_user_id=uuid4(),
            inspector_full_name="Amy",
            inspector_phone=None,
            subject_scope="CORE",
        ),
    ]
    merged = merge_centre_posted_inspectors(rows)
    assert [row.inspector_full_name for row in merged] == ["Amy", "Zed"]
    assert merged[0].subject_scope == "CORE"
    assert merged[1].subject_scope == "ELECTIVE"
