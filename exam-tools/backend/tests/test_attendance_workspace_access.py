"""Shared attendance visibility for co-posted inspectors at the same centre."""

from unittest.mock import MagicMock
from uuid import uuid4

from app.models import ExamInspectorSubjectScope
from app.services.inspector_posting import InspectorWorkspaceContext
from app.services.subject_scope import attendance_sheet_accessible_in_workspace


def _ctx(
    *,
    centre_id,
    posting_scope: ExamInspectorSubjectScope,
) -> InspectorWorkspaceContext:
    centre = MagicMock()
    centre.id = centre_id
    return InspectorWorkspaceContext(
        examination_centre=centre,
        scope_ids=set(),
        subject_scope=posting_scope,
        posting=MagicMock(),
    )


def _sheet(*, centre_id, sheet_scope: ExamInspectorSubjectScope) -> MagicMock:
    sheet = MagicMock()
    sheet.examination_centre_id = centre_id
    sheet.subject_scope = sheet_scope
    return sheet


def test_same_centre_core_posting_sees_peer_core_sheet() -> None:
    centre_id = uuid4()
    ctx = _ctx(centre_id=centre_id, posting_scope=ExamInspectorSubjectScope.CORE)
    sheet = _sheet(centre_id=centre_id, sheet_scope=ExamInspectorSubjectScope.CORE)
    assert attendance_sheet_accessible_in_workspace(ctx, sheet) is True


def test_same_centre_core_posting_does_not_see_elective_sheet() -> None:
    centre_id = uuid4()
    ctx = _ctx(centre_id=centre_id, posting_scope=ExamInspectorSubjectScope.CORE)
    sheet = _sheet(centre_id=centre_id, sheet_scope=ExamInspectorSubjectScope.ELECTIVE)
    assert attendance_sheet_accessible_in_workspace(ctx, sheet) is False


def test_same_centre_elective_posting_does_not_see_core_sheet() -> None:
    centre_id = uuid4()
    ctx = _ctx(centre_id=centre_id, posting_scope=ExamInspectorSubjectScope.ELECTIVE)
    sheet = _sheet(centre_id=centre_id, sheet_scope=ExamInspectorSubjectScope.CORE)
    assert attendance_sheet_accessible_in_workspace(ctx, sheet) is False


def test_all_posting_sees_core_and_elective_at_same_centre() -> None:
    centre_id = uuid4()
    ctx = _ctx(centre_id=centre_id, posting_scope=ExamInspectorSubjectScope.ALL)
    assert (
        attendance_sheet_accessible_in_workspace(
            ctx, _sheet(centre_id=centre_id, sheet_scope=ExamInspectorSubjectScope.CORE)
        )
        is True
    )
    assert (
        attendance_sheet_accessible_in_workspace(
            ctx, _sheet(centre_id=centre_id, sheet_scope=ExamInspectorSubjectScope.ELECTIVE)
        )
        is True
    )


def test_core_posting_sees_all_peer_core_upload() -> None:
    """ALL inspector uploads CORE; CORE co-posted inspector at same centre can access."""
    centre_id = uuid4()
    ctx = _ctx(centre_id=centre_id, posting_scope=ExamInspectorSubjectScope.CORE)
    sheet = _sheet(centre_id=centre_id, sheet_scope=ExamInspectorSubjectScope.CORE)
    assert attendance_sheet_accessible_in_workspace(ctx, sheet) is True


def test_core_posting_does_not_see_all_peer_elective_upload() -> None:
    centre_id = uuid4()
    ctx = _ctx(centre_id=centre_id, posting_scope=ExamInspectorSubjectScope.CORE)
    sheet = _sheet(centre_id=centre_id, sheet_scope=ExamInspectorSubjectScope.ELECTIVE)
    assert attendance_sheet_accessible_in_workspace(ctx, sheet) is False


def test_different_centre_denied_even_with_matching_scope() -> None:
    ctx = _ctx(centre_id=uuid4(), posting_scope=ExamInspectorSubjectScope.CORE)
    sheet = _sheet(centre_id=uuid4(), sheet_scope=ExamInspectorSubjectScope.CORE)
    assert attendance_sheet_accessible_in_workspace(ctx, sheet) is False
