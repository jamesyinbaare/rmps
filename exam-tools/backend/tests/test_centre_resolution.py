"""Centre scope mapping after UNIFIED → SPLIT upgrade."""

from types import SimpleNamespace

from app.models import (
    CentreStructureMode,
    ExamInspectorSubjectScope,
    ExaminationCentreMembershipScope,
)
from app.services.centre_resolution import membership_scope_for_inspector_scope


def _exam(mode: CentreStructureMode) -> SimpleNamespace:
    return SimpleNamespace(centre_structure_mode=mode)


def test_membership_scope_unified_all() -> None:
    exam = _exam(CentreStructureMode.UNIFIED)
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.ALL)
        == ExaminationCentreMembershipScope.ALL
    )


def test_membership_scope_split_all_uses_core_not_all() -> None:
    exam = _exam(CentreStructureMode.SPLIT)
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.ALL)
        == ExaminationCentreMembershipScope.CORE
    )


def test_membership_scope_split_core_elective() -> None:
    exam = _exam(CentreStructureMode.SPLIT)
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.CORE)
        == ExaminationCentreMembershipScope.CORE
    )
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.ELECTIVE)
        == ExaminationCentreMembershipScope.ELECTIVE
    )
