"""Helpers for absent-score QA review (flatten SubjectScore rows into per-paper entries)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import ColumnElement, and_, func

from app.models import SubjectScore
from app.utils.score_utils import is_absent

AbsentMarker = Literal["A", "AA", "AAA"]

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
