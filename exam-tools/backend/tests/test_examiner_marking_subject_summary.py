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


def test_merge_subject_marking_summaries_per_paper_variance() -> None:
    subjects = [_subject(1, "MATH", "Mathematics"), _subject(2, "ENG", "English")]
    rows = merge_subject_marking_summaries(
        subjects=subjects,
        registered={1: 1000, 2: 500},
        allocated_by_subject_paper={
            (1, 1): 980,
            (1, 2): 990,
            (2, 1): 520,
        },
        examiners={1: 12, 2: 8},
        campaign_papers={1: {1, 2}, 2: {1}},
    )
    assert len(rows) == 2
    math = next(r for r in rows if r.subject_id == 1)
    assert math.registered_candidates == 1000
    assert math.total_allocated_scripts == 1970
    assert math.examiner_count == 12
    # Per paper: (980-1000) + (990-1000) = -30 — not 1970-1000
    assert math.variance == -30
    assert [(p.paper_number, p.allocated_scripts, p.variance) for p in math.papers] == [
        (1, 980, -20),
        (2, 990, -10),
    ]
    eng = next(r for r in rows if r.subject_id == 2)
    assert eng.variance == 20
    assert len(eng.papers) == 1
    assert eng.papers[0].paper_number == 1
    assert eng.papers[0].registered_candidates == 500


def test_merge_skips_unknown_subjects_and_empty_rows() -> None:
    subjects = [_subject(1, "MATH", "Mathematics")]
    rows = merge_subject_marking_summaries(
        subjects=subjects,
        registered={99: 10},
        allocated_by_subject_paper={},
        examiners={},
    )
    assert rows == []


def test_merge_includes_examiner_only_subject() -> None:
    subjects = [_subject(3, "SCI", "Science")]
    rows = merge_subject_marking_summaries(
        subjects=subjects,
        registered={},
        allocated_by_subject_paper={(3, 1): 50},
        examiners={3: 5},
        campaign_papers={3: {1}},
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
        papers=[
            {
                "paper_number": 1,
                "registered_candidates": 0,
                "allocated_scripts": 50,
                "variance": 50,
            }
        ],
    )


def test_merge_does_not_compare_combined_papers_to_one_registration() -> None:
    """1000 candidates × 2 papers with full allocation must not look over-allocated."""
    subjects = [_subject(1, "MATH", "Mathematics")]
    rows = merge_subject_marking_summaries(
        subjects=subjects,
        registered={1: 1000},
        allocated_by_subject_paper={(1, 1): 1000, (1, 2): 1000},
        examiners={1: 10},
        campaign_papers={1: {1, 2}},
    )
    math = rows[0]
    assert math.total_allocated_scripts == 2000
    assert math.variance == 0
    assert all(p.variance == 0 for p in math.papers)
