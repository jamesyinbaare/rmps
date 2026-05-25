"""Subject scope and inspector submission settings."""

from datetime import date

import pytest
from fastapi import HTTPException

from app.models import ExamInspectorSubjectScope, ExaminationInspectorSubmissionSettings
from app.services import subject_scope
from app.services.inspector_submission_settings import (
    is_submission_period_open,
    validate_submission_period_dates,
)


def test_resolve_working_scope_core_posting() -> None:
    assert (
        subject_scope.resolve_working_scope(ExamInspectorSubjectScope.CORE, None)
        == ExamInspectorSubjectScope.CORE
    )


def test_resolve_working_scope_all_requires_requested() -> None:
    with pytest.raises(HTTPException) as exc:
        subject_scope.resolve_working_scope(ExamInspectorSubjectScope.ALL, None)
    assert exc.value.status_code == 400


def test_resolve_attendance_scope_single_core() -> None:
    resolved = subject_scope.resolve_attendance_scope(
        ExamInspectorSubjectScope.ALL,
        {ExamInspectorSubjectScope.CORE},
        None,
    )
    assert resolved == ExamInspectorSubjectScope.CORE


def test_resolve_attendance_scope_ambiguous_requires_choice() -> None:
    with pytest.raises(HTTPException) as exc:
        subject_scope.resolve_attendance_scope(
            ExamInspectorSubjectScope.ALL,
            {ExamInspectorSubjectScope.CORE, ExamInspectorSubjectScope.ELECTIVE},
            None,
        )
    assert exc.value.status_code == 400


def test_resolve_attendance_scope_ambiguous_with_choice() -> None:
    resolved = subject_scope.resolve_attendance_scope(
        ExamInspectorSubjectScope.ALL,
        {ExamInspectorSubjectScope.CORE, ExamInspectorSubjectScope.ELECTIVE},
        "ELECTIVE",
    )
    assert resolved == ExamInspectorSubjectScope.ELECTIVE


def test_submission_period_open_per_scope() -> None:
    settings = ExaminationInspectorSubmissionSettings(
        examination_id=1,
        core_submission_period_start=date(2026, 5, 1),
        core_submission_period_end=date(2026, 5, 15),
        elective_submission_period_start=date(2026, 5, 20),
        elective_submission_period_end=date(2026, 5, 31),
    )
    assert is_submission_period_open(settings, date(2026, 5, 10), ExamInspectorSubjectScope.CORE)
    assert not is_submission_period_open(settings, date(2026, 5, 10), ExamInspectorSubjectScope.ELECTIVE)
    assert is_submission_period_open(settings, date(2026, 5, 25), ExamInspectorSubjectScope.ELECTIVE)
    assert not is_submission_period_open(settings, date(2026, 6, 1), ExamInspectorSubjectScope.CORE)


def test_validate_submission_period_dates() -> None:
    validate_submission_period_dates(date(2026, 1, 1), date(2026, 1, 31), field_prefix="core_submission_period")
    with pytest.raises(HTTPException):
        validate_submission_period_dates(date(2026, 2, 1), date(2026, 1, 1), field_prefix="elective_submission_period")
