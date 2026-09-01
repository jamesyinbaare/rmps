"""Helpers for absent-score QA review (flatten SubjectScore rows into per-paper entries)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import ColumnElement, and_, func

from app.models import SubjectScore
from app.utils.score_utils import ABSENT_RESULT_SENTINEL, is_absent

AbsentMarker = Literal["A", "AA", "AAA"]
AbsentBucket = Literal["fully_absent", "mixed"]

ABSENT_MARKERS: frozenset[str] = frozenset({"A", "AA", "AAA"})

PAPER_FIELDS: tuple[tuple[str, str, int, str], ...] = (
    ("obj_raw_score", "obj_document_id", 1, "obj_max_score"),
    ("essay_raw_score", "essay_document_id", 2, "essay_max_score"),
    ("pract_raw_score", "pract_document_id", 3, "pract_max_score"),
)


def normalize_absent_marker(value: str | None) -> str | None:
    if value is None:
        return None
    upper = str(value).strip().upper()
    return upper if upper in ABSENT_MARKERS else None


def paper_matches_filters(
    score_value: str | None,
    paper_test_type: int,
    *,
    test_type_filter: int | None,
    absent_marker_filter: str | None,
) -> bool:
    if test_type_filter is not None and paper_test_type != test_type_filter:
        return False
    marker = normalize_absent_marker(score_value)
    if marker is None:
        return False
    if absent_marker_filter is not None and marker != absent_marker_filter.upper():
        return False
    return True


def absent_field_sql(column: ColumnElement[Any], absent_marker: str | None) -> ColumnElement[bool]:
    trimmed = func.upper(func.trim(column))
    if absent_marker:
        return and_(column.isnot(None), trimmed == absent_marker.upper())
    return and_(column.isnot(None), trimmed.in_(tuple(ABSENT_MARKERS)))


def score_has_matching_absent(
    subject_score: SubjectScore,
    *,
    test_type_filter: int | None,
    absent_marker_filter: str | None,
) -> bool:
    for field_name, _, paper_test_type, _ in PAPER_FIELDS:
        if paper_matches_filters(
            getattr(subject_score, field_name),
            paper_test_type,
            test_type_filter=test_type_filter,
            absent_marker_filter=absent_marker_filter,
        ):
            return True
    return False


def is_fully_absent_total(total_score: float | None) -> bool:
    """True when subject total is the full-absence sentinel (-1)."""
    if total_score is None:
        return False
    return float(total_score) == ABSENT_RESULT_SENTINEL


def is_scored_total(total_score: float | None) -> bool:
    """True when subject has a numeric (non-absent) total."""
    if total_score is None:
        return False
    return float(total_score) != ABSENT_RESULT_SENTINEL


@dataclass(frozen=True)
class RegisteredSubjectInfo:
    subject_id: int
    subject_code: str
    subject_name: str
    score_id: int | None
    total_score: float | None
    grade: Any
    obj_raw_score: str | None = None
    essay_raw_score: str | None = None
    pract_raw_score: str | None = None
    obj_expected: bool = False
    essay_expected: bool = False
    pract_expected: bool = False


def _raw_is_blank(value: str | None) -> bool:
    return value is None or str(value).strip() == ""


def subject_has_numeric_raw(reg: RegisteredSubjectInfo) -> bool:
    """True when any entered raw score is a real (non-absent) mark, including '0'."""
    for value in (reg.obj_raw_score, reg.essay_raw_score, reg.pract_raw_score):
        if _raw_is_blank(value):
            continue
        if normalize_absent_marker(value) is None:
            return True
    return False


def is_subject_fully_absent(reg: RegisteredSubjectInfo) -> bool:
    """
    Subject is fully absent only when every expected paper is entered and is A/AA/AAA.

    Classification uses raw scores only (not total_score).
    Blank expected papers are not absent. Numeric zero is not absent.
    Missing score row / no expected papers → not fully absent.
    """
    expected: list[tuple[bool, str | None]] = [
        (reg.obj_expected, reg.obj_raw_score),
        (reg.essay_expected, reg.essay_raw_score),
        (reg.pract_expected, reg.pract_raw_score),
    ]
    expected_papers = [(exp, raw) for exp, raw in expected if exp]
    if not expected_papers:
        return False
    if reg.score_id is None:
        return False

    for _exp, raw in expected_papers:
        if _raw_is_blank(raw):
            return False
        if normalize_absent_marker(raw) is None:
            return False
    return True


@dataclass(frozen=True)
class AbsentPaperRow:
    score_id: int
    candidate_id: int
    candidate_name: str
    candidate_index_number: str
    school_id: int | None
    school_name: str | None
    school_code: str | None
    subject_id: int
    subject_code: str
    subject_name: str
    exam_id: int
    test_type: int
    field_name: str
    absent_marker: str
    obj_raw_score: str | None
    essay_raw_score: str | None
    pract_raw_score: str | None
    total_score: float
    grade: Any
    max_score: float | None
    document_id: str | None
    document_file_name: str | None
    document_numeric_id: int | None
    document_mime_type: str | None


@dataclass(frozen=True)
class PendingPaperSummary:
    score_id: int
    field_name: str
    test_type: int
    absent_marker: str


@dataclass(frozen=True)
class SubjectGroupSummary:
    subject_id: int
    subject_code: str
    subject_name: str
    score_id: int | None
    total_score: float | None
    grade: Any
    is_fully_absent: bool
    pending_papers: list[PendingPaperSummary]


@dataclass(frozen=True)
class CandidateAbsentGroup:
    candidate_id: int
    candidate_name: str
    candidate_index_number: str
    school_id: int | None
    school_name: str | None
    school_code: str | None
    exam_id: int
    bucket: AbsentBucket
    registered_subject_count: int
    fully_absent_subject_count: int
    scored_subject_count: int
    pending_paper_count: int
    subjects: list[SubjectGroupSummary]


@dataclass
class AbsentReviewStatsCounts:
    candidates_fully_absent: int = 0
    candidates_mixed: int = 0
    pending_papers: int = 0
    subjects_fully_absent: int = 0
    confirmed_papers: int = 0


def flatten_absent_papers(
    subject_score: SubjectScore,
    *,
    candidate: Any,
    school: Any | None,
    exam: Any,
    exam_subject: Any,
    subject: Any,
    documents_by_extracted_id: dict[str, Any],
    test_type_filter: int | None,
    absent_marker_filter: str | None,
) -> list[AbsentPaperRow]:
    rows: list[AbsentPaperRow] = []
    for field_name, doc_field, paper_test_type, max_field in PAPER_FIELDS:
        score_value = getattr(subject_score, field_name)
        if not paper_matches_filters(
            score_value,
            paper_test_type,
            test_type_filter=test_type_filter,
            absent_marker_filter=absent_marker_filter,
        ):
            continue

        doc_id = getattr(subject_score, doc_field)
        doc = documents_by_extracted_id.get(doc_id) if doc_id else None
        marker = normalize_absent_marker(score_value)
        assert marker is not None

        rows.append(
            AbsentPaperRow(
                score_id=subject_score.id,
                candidate_id=candidate.id,
                candidate_name=candidate.name,
                candidate_index_number=candidate.index_number,
                school_id=school.id if school else None,
                school_name=school.name if school else None,
                school_code=school.code if school else None,
                subject_id=subject.id,
                subject_code=subject.code,
                subject_name=subject.name,
                exam_id=exam.id,
                test_type=paper_test_type,
                field_name=field_name,
                absent_marker=marker,
                obj_raw_score=subject_score.obj_raw_score,
                essay_raw_score=subject_score.essay_raw_score,
                pract_raw_score=subject_score.pract_raw_score,
                total_score=subject_score.total_score,
                grade=subject_score.grade,
                max_score=getattr(exam_subject, max_field),
                document_id=doc_id,
                document_file_name=doc.file_name if doc else None,
                document_numeric_id=doc.id if doc else None,
                document_mime_type=doc.mime_type if doc else None,
            )
        )
    return rows


def sort_absent_papers(rows: list[AbsentPaperRow]) -> list[AbsentPaperRow]:
    return sorted(
        rows,
        key=lambda r: (
            r.candidate_index_number or "",
            r.subject_code or "",
            r.test_type,
            r.field_name,
        ),
    )


def paginate_rows(rows: list[AbsentPaperRow], page: int, page_size: int) -> list[AbsentPaperRow]:
    offset = (page - 1) * page_size
    return rows[offset : offset + page_size]


def filter_unconfirmed_rows(
    rows: list[AbsentPaperRow],
    confirmed_keys: set[tuple[int, str]],
) -> list[AbsentPaperRow]:
    if not confirmed_keys:
        return rows
    return [row for row in rows if (row.score_id, row.field_name) not in confirmed_keys]


def field_still_absent(field_name: str, updated_scores: dict[str, str | None]) -> bool:
    return is_absent(updated_scores.get(field_name))


def classify_candidate_bucket(
    registered: list[RegisteredSubjectInfo],
) -> AbsentBucket:
    """
    fully_absent: every registered subject is fully absent
    (all expected papers entered as A/AA/AAA, based on raw scores).

    Blank expected papers, numeric marks (including 0), or missing score rows → mixed.
    """
    if not registered:
        return "mixed"
    if all(is_subject_fully_absent(s) for s in registered):
        return "fully_absent"
    return "mixed"


def build_candidate_group(
    *,
    candidate_id: int,
    candidate_name: str,
    candidate_index_number: str,
    school_id: int | None,
    school_name: str | None,
    school_code: str | None,
    exam_id: int,
    registered: list[RegisteredSubjectInfo],
    pending_papers: list[AbsentPaperRow],
) -> CandidateAbsentGroup | None:
    """Build a candidate group when there is at least one pending absent paper."""
    if not pending_papers:
        return None

    papers_by_subject: dict[int, list[PendingPaperSummary]] = {}
    for paper in pending_papers:
        papers_by_subject.setdefault(paper.subject_id, []).append(
            PendingPaperSummary(
                score_id=paper.score_id,
                field_name=paper.field_name,
                test_type=paper.test_type,
                absent_marker=paper.absent_marker,
            )
        )

    subjects: list[SubjectGroupSummary] = []
    fully_absent_count = 0
    scored_count = 0
    for reg in sorted(registered, key=lambda s: s.subject_code or ""):
        fully = is_subject_fully_absent(reg)
        if fully:
            fully_absent_count += 1
        if subject_has_numeric_raw(reg):
            scored_count += 1
        subjects.append(
            SubjectGroupSummary(
                subject_id=reg.subject_id,
                subject_code=reg.subject_code,
                subject_name=reg.subject_name,
                score_id=reg.score_id,
                total_score=reg.total_score,
                grade=reg.grade,
                is_fully_absent=fully,
                pending_papers=sorted(
                    papers_by_subject.get(reg.subject_id, []),
                    key=lambda p: (p.test_type, p.field_name),
                ),
            )
        )

    known_ids = {s.subject_id for s in subjects}
    for subject_id, papers in papers_by_subject.items():
        if subject_id in known_ids:
            continue
        sample = next(p for p in pending_papers if p.subject_id == subject_id)
        synth = RegisteredSubjectInfo(
            subject_id=subject_id,
            subject_code=sample.subject_code,
            subject_name=sample.subject_name,
            score_id=sample.score_id,
            total_score=sample.total_score,
            grade=sample.grade,
            obj_raw_score=sample.obj_raw_score,
            essay_raw_score=sample.essay_raw_score,
            pract_raw_score=sample.pract_raw_score,
        )
        fully = is_subject_fully_absent(synth)
        if fully:
            fully_absent_count += 1
        if subject_has_numeric_raw(synth):
            scored_count += 1
        subjects.append(
            SubjectGroupSummary(
                subject_id=subject_id,
                subject_code=sample.subject_code,
                subject_name=sample.subject_name,
                score_id=sample.score_id,
                total_score=sample.total_score,
                grade=sample.grade,
                is_fully_absent=fully,
                pending_papers=sorted(papers, key=lambda p: (p.test_type, p.field_name)),
            )
        )

    bucket = classify_candidate_bucket(registered)
    return CandidateAbsentGroup(
        candidate_id=candidate_id,
        candidate_name=candidate_name,
        candidate_index_number=candidate_index_number,
        school_id=school_id,
        school_name=school_name,
        school_code=school_code,
        exam_id=exam_id,
        bucket=bucket,
        registered_subject_count=len(registered),
        fully_absent_subject_count=fully_absent_count,
        scored_subject_count=scored_count,
        pending_paper_count=len(pending_papers),
        subjects=subjects,
    )


def sort_candidate_groups(groups: list[CandidateAbsentGroup]) -> list[CandidateAbsentGroup]:
    return sorted(
        groups,
        key=lambda g: (
            0 if g.bucket == "mixed" else 1,
            g.candidate_index_number or "",
            g.candidate_id,
        ),
    )


def paginate_groups(
    groups: list[CandidateAbsentGroup], page: int, page_size: int
) -> list[CandidateAbsentGroup]:
    offset = (page - 1) * page_size
    return groups[offset : offset + page_size]


def filter_groups_by_bucket(
    groups: list[CandidateAbsentGroup],
    bucket: AbsentBucket | Literal["all"] | None,
) -> list[CandidateAbsentGroup]:
    if bucket is None or bucket == "all":
        return groups
    return [g for g in groups if g.bucket == bucket]


def compute_group_stats(groups: list[CandidateAbsentGroup]) -> AbsentReviewStatsCounts:
    stats = AbsentReviewStatsCounts()
    for group in groups:
        if group.bucket == "fully_absent":
            stats.candidates_fully_absent += 1
        else:
            stats.candidates_mixed += 1
        stats.pending_papers += group.pending_paper_count
        stats.subjects_fully_absent += sum(
            1 for s in group.subjects if s.is_fully_absent and s.pending_papers
        )
    return stats
