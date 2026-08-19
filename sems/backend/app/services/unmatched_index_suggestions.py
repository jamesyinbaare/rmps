"""OCR-noise index suggestions for unmatched extraction records."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    Document,
    ExamRegistration,
    ExamSubject,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    UnmatchedExtractionRecord,
    UnmatchedRecordStatus,
)
from app.utils.index_utils import (
    filter_index_matches,
    highlight_index_parts,
    index_noise_chars,
    normalize_index_number,
)

OCR_CANDIDATE_LIMIT = 500


def score_field_for_test_type(test_type: str | None) -> str | None:
    if test_type == "1":
        return "obj"
    if test_type == "2":
        return "essay"
    if test_type == "3":
        return "pract"
    return None


def suggestion_payload(
    *,
    raw: str | None,
    cleaned: str | None,
    matches: list[dict[str, Any]],
) -> dict[str, Any]:
    unique = len(matches) == 1
    likely_ocr_noise = bool(cleaned) and unique and (raw or "") != cleaned
    return {
        "raw_index_number": raw,
        "cleaned_index_number": cleaned,
        "noise_chars": index_noise_chars(raw, cleaned) if raw else "",
        "highlight": highlight_index_parts(raw, cleaned) if raw else [],
        "matches": matches,
        "unique": unique,
        "likely_ocr_noise": likely_ocr_noise,
    }


def _scoped_candidate_stmt(document: Document):
    stmt = (
        select(
            SubjectRegistration.id,
            Candidate.index_number,
            Candidate.name,
            School.name,
            SubjectScore.obj_raw_score,
            SubjectScore.essay_raw_score,
            SubjectScore.pract_raw_score,
        )
        .select_from(SubjectRegistration)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .outerjoin(School, Candidate.school_id == School.id)
        .outerjoin(SubjectScore, SubjectScore.subject_registration_id == SubjectRegistration.id)
    )
    if document.exam_id is not None:
        stmt = stmt.where(ExamRegistration.exam_id == document.exam_id)
    if document.subject_id is not None:
        stmt = stmt.join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id).where(
            ExamSubject.subject_id == document.subject_id
        )
    return stmt


async def lookup_index_matches(
    session: AsyncSession,
    document: Document,
    cleaned: str,
    *,
    search: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    stmt = _scoped_candidate_stmt(document)
    score_field = score_field_for_test_type(document.test_type)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Candidate.index_number.ilike(like),
                Candidate.name.ilike(like),
            )
        )
        stmt = stmt.order_by(Candidate.index_number).limit(limit)
        result = await session.execute(stmt)
        return [_match_dict(row, score_field=score_field) for row in result.all()]

    if not cleaned:
        return []

    exact_result = await session.execute(stmt.where(Candidate.index_number == cleaned))
    exact_rows = list(exact_result.all())
    ranked = filter_index_matches(cleaned, exact_rows)
    if ranked:
        return [_match_dict(row, score_field=score_field) for row in ranked]

    fuzzy_result = await session.execute(
        stmt.where(
            or_(
                Candidate.index_number.like(f"%{cleaned}"),
                Candidate.index_number.like(f"{cleaned}%"),
            )
        ).limit(50)
    )
    ranked = filter_index_matches(cleaned, list(fuzzy_result.all()))
    if len(ranked) == 1:
        return [_match_dict(row, score_field=score_field) for row in ranked]
    return [_match_dict(row, score_field=score_field) for row in ranked[:limit]]


def _current_score_from_row(row: tuple, score_field: str | None) -> str | None:
    if score_field == "obj":
        return row[4] if len(row) > 4 else None
    if score_field == "essay":
        return row[5] if len(row) > 5 else None
    if score_field == "pract":
        return row[6] if len(row) > 6 else None
    return None


def _match_dict(row: tuple, *, score_field: str | None = None) -> dict[str, Any]:
    return {
        "subject_registration_id": row[0],
        "index_number": row[1],
        "candidate_name": row[2],
        "school_name": row[3],
        "current_score": _current_score_from_row(row, score_field),
    }


def suggestion_from_candidate_rows(
    raw_index: str | None,
    rows: list[tuple],
    test_type: str | None,
) -> dict[str, Any]:
    """Build a suggestion payload from preloaded scoped candidate rows (no extra DB)."""
    cleaned = normalize_index_number(raw_index)
    score_field = score_field_for_test_type(test_type)
    if not cleaned:
        payload = suggestion_payload(raw=raw_index, cleaned=None, matches=[])
    else:
        ranked = filter_index_matches(cleaned, rows)
        payload = suggestion_payload(
            raw=raw_index,
            cleaned=cleaned,
            matches=[_match_dict(row, score_field=score_field) for row in ranked],
        )
    payload["score_field"] = score_field
    return payload


async def load_scoped_candidate_rows(
    session: AsyncSession,
    document: Document,
) -> list[tuple]:
    result = await session.execute(_scoped_candidate_stmt(document))
    return list(result.all())


async def suggest_for_unmatched(
    session: AsyncSession,
    document: Document,
    raw_index: str | None,
    *,
    search: str | None = None,
) -> dict[str, Any]:
    cleaned = normalize_index_number(raw_index)
    query = (search or "").strip() or None
    if query:
        query_cleaned = normalize_index_number(query)
        if query_cleaned:
            matches = await lookup_index_matches(session, document, query_cleaned)
            if not matches and any(ch.isalpha() for ch in query):
                matches = await lookup_index_matches(session, document, query_cleaned, search=query)
            payload = suggestion_payload(raw=raw_index, cleaned=query_cleaned, matches=matches)
        else:
            matches = await lookup_index_matches(session, document, cleaned or "", search=query)
            payload = suggestion_payload(raw=raw_index, cleaned=cleaned, matches=matches)
    else:
        matches = await lookup_index_matches(session, document, cleaned) if cleaned else []
        payload = suggestion_payload(raw=raw_index, cleaned=cleaned, matches=matches)
    payload["score_field"] = score_field_for_test_type(document.test_type)
    return payload


async def list_unique_ocr_candidates(
    session: AsyncSession,
    *,
    document_id: int | None = None,
    extraction_method: Any = None,
    record_ids: list[int] | None = None,
    limit: int = OCR_CANDIDATE_LIMIT,
) -> tuple[list[dict[str, Any]], int]:
    """Return pending unmatched rows whose cleaned index uniquely matches one candidate.

    Suggestions are batched by (exam_id, subject_id) to avoid per-row candidate lookups.
    Returns (items, total_unique_count). Each item has record, document, school_name,
    subject_name, suggestion.
    """
    stmt = (
        select(UnmatchedExtractionRecord, Document, School.name, Subject.name)
        .join(Document, UnmatchedExtractionRecord.document_id == Document.id)
        .outerjoin(School, Document.school_id == School.id)
        .outerjoin(Subject, Document.subject_id == Subject.id)
        .where(UnmatchedExtractionRecord.status == UnmatchedRecordStatus.PENDING)
    )
    if document_id is not None:
        stmt = stmt.where(UnmatchedExtractionRecord.document_id == document_id)
    if extraction_method is not None:
        stmt = stmt.where(UnmatchedExtractionRecord.extraction_method == extraction_method)
    if record_ids is not None:
        if not record_ids:
            return [], 0
        stmt = stmt.where(UnmatchedExtractionRecord.id.in_(record_ids))

    result = await session.execute(stmt.order_by(UnmatchedExtractionRecord.id))
    rows = list(result.all())

    groups: dict[tuple[int | None, int | None], list[Any]] = defaultdict(list)
    for row in rows:
        document: Document = row[1]
        groups[(document.exam_id, document.subject_id)].append(row)

    unique_items: list[dict[str, Any]] = []
    for group_rows in groups.values():
        scoped_rows = await load_scoped_candidate_rows(session, group_rows[0][1])
        for unmatched_record, document, school_name, subject_name in group_rows:
            suggestion = suggestion_from_candidate_rows(
                unmatched_record.index_number,
                scoped_rows,
                document.test_type,
            )
            if not suggestion.get("likely_ocr_noise"):
                continue
            unique_items.append(
                {
                    "record": unmatched_record,
                    "document": document,
                    "school_name": school_name,
                    "subject_name": subject_name,
                    "suggestion": suggestion,
                }
            )

    total = len(unique_items)
    return unique_items[: max(limit, 0)], total
