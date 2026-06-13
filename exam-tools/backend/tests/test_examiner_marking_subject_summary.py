"""Tests for per-subject marking summary aggregation."""

from unittest.mock import MagicMock

from app.schemas.admin_examiner_marking_summary import AdminExaminerMarkingSubjectSummaryRow
from app.services.examiner_marking_subject_summary import merge_subject_marking_summaries


def _subject(subject_id: int, code: str, name: str) -> MagicMock:
    sub = MagicMock()
    sub.id = subject_id
    sub.code = code
    sub.original_code = code
    sub.name = name
    return sub


def test_merge_subject_marking_summaries_variance() -> None:
    subjects = [_subject(1, "MATH", "Mathematics"), _subject(2, "ENG", "English")]
    rows = merge_subject_marking_summaries(
        subjects=subjects,
        registered={1: 1000, 2: 500},
        allocated={1: 980, 2: 520},
        examiners={1: 12, 2: 8},
    )
    assert len(rows) == 2
    math = next(r for r in rows if r.subject_id == 1)
    assert math.registered_candidates == 1000
    assert math.total_allocated_scripts == 980
    assert math.examiner_count == 12
    assert math.variance == -20
    eng = next(r for r in rows if r.subject_id == 2)
    assert eng.variance == 20


def test_merge_skips_unknown_subjects_and_empty_rows() -> None:
    subjects = [_subject(1, "MATH", "Mathematics")]
    rows = merge_subject_marking_summaries(
        subjects=subjects,
        registered={99: 10},
        allocated={},
        examiners={},
    )
    assert rows == []


def test_merge_includes_examiner_only_subject() -> None:
    subjects = [_subject(3, "SCI", "Science")]
    rows = merge_subject_marking_summaries(
        subjects=subjects,
        registered={},
        allocated={3: 50},
        examiners={3: 5},
    )
    assert len(rows) == 1
    assert rows[0] == AdminExaminerMarkingSubjectSummaryRow(
        subject_id=3,
        subject_code="SCI",
        subject_name="Science",
        registered_candidates=0,
        total_allocated_scripts=50,
        examiner_count=5,
        variance=50,
    )
