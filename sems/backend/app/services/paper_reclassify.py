"""Reclassify document paper/subject and migrate applied SubjectScore fields."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    Document,
    ExamRegistration,
    ExamSubject,
    Subject,
    SubjectRegistration,
    SubjectScore,
)

# test_type -> (raw_score, document_id, extraction_method, normalized)
PAPER_ATTRS: dict[str, tuple[str, str, str, str]] = {
    "1": ("obj_raw_score", "obj_document_id", "obj_extraction_method", "obj_normalized"),
    "2": ("essay_raw_score", "essay_document_id", "essay_extraction_method", "essay_normalized"),
    "3": ("pract_raw_score", "pract_document_id", "pract_extraction_method", "pract_normalized"),
}


@dataclass
class ReclassifyResult:
    document_id: int
    old_extracted_id: str | None
    new_extracted_id: str | None
    old_test_type: str | None
    new_test_type: str
    scores_moved: int
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


@dataclass
class ScoreConflict:
    index_number: str | None
    candidate_name: str | None
    existing_score: str | None
    existing_document_id: str | None
    subject_score_id: int | None = None


@dataclass
class MigrationEndpoint:
    extracted_id: str | None
    subject_id: int | None
    subject_code: str | None
    subject_name: str | None
    test_type: str | None
    paper_label: str | None


@dataclass
class MigrationResult:
    scores_to_move: int = 0
    scores_moved: int = 0
    conflicts: list[ScoreConflict] = field(default_factory=list)
    blocking_errors: list[str] = field(default_factory=list)
    subject_changed: bool = False
    paper_changed: bool = False
    requires_confirm: bool = False
    from_meta: MigrationEndpoint | None = None
    to_meta: MigrationEndpoint | None = None

    @property
    def has_blocking(self) -> bool:
        return bool(self.blocking_errors)

    @property
    def has_conflicts(self) -> bool:
        return bool(self.conflicts)


def paper_label(test_type: str | None) -> str | None:
    if test_type == "1":
        return "Objectives"
    if test_type == "2":
        return "Essay"
    if test_type == "3":
        return "Practicals"
    if test_type:
        return f"Paper {test_type}"
    return None


def rewrite_extracted_id_test_type(extracted_id: str, target_test_type: str) -> str:
    if len(extracted_id) != 13:
        raise ValueError("extracted_id must be exactly 13 characters")
    if target_test_type not in ("1", "2"):
        raise ValueError("target_test_type must be 1 or 2")
    return extracted_id[:10] + target_test_type + extracted_id[11:]


def flipped_test_type(test_type: str | None) -> str | None:
    """Return the other paper type (1↔2), or None if unknown."""
    if test_type == "1":
        return "2"
    if test_type == "2":
        return "1"
    return None


async def find_paper_counterpart(
    session: AsyncSession, document: Document
) -> Document | None:
    """Find the other-paper sheet for the same school/subject/series/page in this exam.

    Prefers structured sheet-key fields; falls back to flipping digit 10 of extracted_id.
    """
    other = flipped_test_type(document.test_type)
    if (
        other
        and document.school_id is not None
        and document.subject_id is not None
        and document.subject_series
        and document.sheet_number
    ):
        stmt = (
            select(Document)
            .where(
                Document.exam_id == document.exam_id,
                Document.school_id == document.school_id,
                Document.subject_id == document.subject_id,
                Document.subject_series == document.subject_series,
                Document.sheet_number == document.sheet_number,
                Document.test_type == other,
                Document.upload_status == "uploaded",
                Document.id != document.id,
            )
            .order_by(Document.uploaded_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        found = result.scalar_one_or_none()
        if found:
            return found

    if document.extracted_id and len(document.extracted_id) == 13 and other:
        try:
            counterpart_id = rewrite_extracted_id_test_type(document.extracted_id, other)
        except ValueError:
            return None
        stmt = (
            select(Document)
            .where(
                Document.exam_id == document.exam_id,
                Document.extracted_id == counterpart_id,
                Document.upload_status == "uploaded",
                Document.id != document.id,
            )
            .order_by(Document.uploaded_at.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    return None


def _paper_attrs(test_type: str) -> tuple[str, str, str, str]:
    attrs = PAPER_ATTRS.get(test_type)
    if not attrs:
        raise ValueError(f"Unsupported test_type: {test_type}")
    return attrs


def _is_target_occupied(
    target_score: object | None,
    target_doc_id: str | None,
    *,
    old_extracted_id: str,
    new_extracted_id: str,
) -> bool:
    """True if target paper fields already hold data from another sheet / entry."""
    allowed = {old_extracted_id, new_extracted_id}
    if target_doc_id and target_doc_id not in allowed:
        return True
    if target_score is not None and not target_doc_id:
        return True
    if target_score is not None and target_doc_id and target_doc_id not in allowed:
        return True
    return False


async def _load_subject_meta(
    session: AsyncSession, subject_id: int | None
) -> tuple[str | None, str | None]:
    if subject_id is None:
        return None, None
    result = await session.execute(select(Subject).where(Subject.id == subject_id))
    subject = result.scalar_one_or_none()
    if not subject:
        return None, None
    return subject.code, subject.name


async def _get_score_for_registration(
    session: AsyncSession, subject_registration_id: int
) -> SubjectScore | None:
    score_stmt = select(SubjectScore).where(
        SubjectScore.subject_registration_id == subject_registration_id
    )
    return (await session.execute(score_stmt)).scalar_one_or_none()


async def _create_score_for_registration(
    session: AsyncSession, subject_registration_id: int
) -> SubjectScore:
    subject_score = SubjectScore(
        subject_registration_id=subject_registration_id,
        obj_raw_score=None,
        essay_raw_score=None,
        pract_raw_score=None,
        obj_normalized=None,
        essay_normalized=None,
        pract_normalized=None,
        total_score=0.0,
    )
    session.add(subject_score)
    await session.flush()
    return subject_score


async def _find_source_rows(
    session: AsyncSession,
    *,
    old_extracted_id: str,
    old_test_type: str | None,
) -> list[tuple[SubjectScore, Candidate | None, ExamRegistration | None]]:
    """SubjectScore rows linked to this sheet, with candidate context when available."""
    if old_test_type and old_test_type in PAPER_ATTRS:
        _, old_doc, _, _ = _paper_attrs(old_test_type)
        doc_filter = getattr(SubjectScore, old_doc) == old_extracted_id
    else:
        doc_filter = or_(
            SubjectScore.obj_document_id == old_extracted_id,
            SubjectScore.essay_document_id == old_extracted_id,
            SubjectScore.pract_document_id == old_extracted_id,
        )

    stmt = (
        select(SubjectScore, Candidate, ExamRegistration)
        .join(
            SubjectRegistration,
            SubjectScore.subject_registration_id == SubjectRegistration.id,
        )
        .join(
            ExamRegistration,
            SubjectRegistration.exam_registration_id == ExamRegistration.id,
        )
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(doc_filter)
    )
    result = await session.execute(stmt)
    return list(result.all())


def _resolve_source_paper(
    row: SubjectScore, old_extracted_id: str, old_test_type: str | None
) -> str:
    if old_test_type and old_test_type in PAPER_ATTRS:
        return old_test_type
    for tt, (_, doc_attr, _, _) in PAPER_ATTRS.items():
        if getattr(row, doc_attr) == old_extracted_id:
            return tt
    raise ValueError(f"Could not determine paper for sheet {old_extracted_id}")


async def migrate_applied_scores_for_id_change(
    session: AsyncSession,
    *,
    exam_id: int,
    old_extracted_id: str,
    new_extracted_id: str,
    old_test_type: str | None,
    new_test_type: str | None,
    old_subject_id: int | None,
    new_subject_id: int | None,
    overwrite: bool = False,
    dry_run: bool = False,
) -> MigrationResult:
    """Move applied scores when extracted_id subject and/or paper changes.

    Returns MigrationResult. Does not raise for soft conflicts when dry_run=True;
    when dry_run=False and conflicts exist without overwrite, blocking_errors notes them
    and no writes are applied (caller should treat as conflict).
    """
    old_tt = old_test_type or (
        old_extracted_id[10:11] if len(old_extracted_id) == 13 else None
    )
    new_tt = new_test_type or (
        new_extracted_id[10:11] if len(new_extracted_id) == 13 else None
    )

    subject_changed = old_subject_id != new_subject_id
    paper_changed = bool(old_tt and new_tt and old_tt != new_tt)
    id_changed = old_extracted_id != new_extracted_id
    requires_confirm = subject_changed or paper_changed

    old_code, old_name = await _load_subject_meta(session, old_subject_id)
    new_code, new_name = await _load_subject_meta(session, new_subject_id)

    result = MigrationResult(
        subject_changed=subject_changed,
        paper_changed=paper_changed,
        requires_confirm=requires_confirm,
        from_meta=MigrationEndpoint(
            extracted_id=old_extracted_id,
            subject_id=old_subject_id,
            subject_code=old_code,
            subject_name=old_name,
            test_type=old_tt,
            paper_label=paper_label(old_tt),
        ),
        to_meta=MigrationEndpoint(
            extracted_id=new_extracted_id,
            subject_id=new_subject_id,
            subject_code=new_code,
            subject_name=new_name,
            test_type=new_tt,
            paper_label=paper_label(new_tt),
        ),
    )

    if not old_extracted_id:
        return result

    if not new_tt or new_tt not in PAPER_ATTRS:
        if id_changed or subject_changed or paper_changed:
            result.blocking_errors.append(
                f"Unsupported or missing target test_type: {new_tt!r}"
            )
        return result

    if old_tt and old_tt not in PAPER_ATTRS:
        result.blocking_errors.append(f"Unsupported source test_type: {old_tt!r}")
        return result

    source_rows = await _find_source_rows(
        session, old_extracted_id=old_extracted_id, old_test_type=old_tt
    )
    result.scores_to_move = len(source_rows)

    if not source_rows:
        return result

    # ID-only: rewrite document_id pointers
    if not subject_changed and not paper_changed:
        if not id_changed:
            return result
        if dry_run:
            return result
        _, doc_attr, _, _ = _paper_attrs(new_tt)
        for score_row, _cand, _ereg in source_rows:
            setattr(score_row, doc_attr, new_extracted_id)
            score_row.updated_at = datetime.utcnow()
            result.scores_moved += 1
        return result

    new_exam_subject: ExamSubject | None = None
    if subject_changed:
        if new_subject_id is None:
            result.blocking_errors.append("New subject_id is required for subject change")
            return result
        es_result = await session.execute(
            select(ExamSubject).where(
                ExamSubject.exam_id == exam_id,
                ExamSubject.subject_id == new_subject_id,
            )
        )
        new_exam_subject = es_result.scalar_one_or_none()
        if not new_exam_subject:
            result.blocking_errors.append(
                f"Subject is not offered in this exam (subject_id={new_subject_id})"
            )
            return result

    # (source_row, target_row|None, target_reg_id|None, source_paper, target_paper, candidate)
    planned: list[
        tuple[
            SubjectScore,
            SubjectScore | None,
            int | None,
            str,
            str,
            Candidate | None,
        ]
    ] = []

    for score_row, candidate, exam_reg in source_rows:
        try:
            source_paper = _resolve_source_paper(score_row, old_extracted_id, old_tt)
        except ValueError as exc:
            result.blocking_errors.append(str(exc))
            continue

        target_paper = new_tt if paper_changed else source_paper
        target_row: SubjectScore | None = score_row
        target_reg_id: int | None = None

        if subject_changed:
            assert new_exam_subject is not None
            assert exam_reg is not None
            reg_stmt = select(SubjectRegistration).where(
                SubjectRegistration.exam_registration_id == exam_reg.id,
                SubjectRegistration.exam_subject_id == new_exam_subject.id,
            )
            target_reg = (await session.execute(reg_stmt)).scalar_one_or_none()
            if not target_reg:
                idx = candidate.index_number if candidate else "?"
                result.blocking_errors.append(
                    f"Candidate {idx} is not registered for the new subject"
                )
                continue
            target_reg_id = target_reg.id
            target_row = await _get_score_for_registration(session, target_reg.id)

        planned.append(
            (score_row, target_row, target_reg_id, source_paper, target_paper, candidate)
        )

    if result.blocking_errors:
        return result

    for source_row, target_row, _reg_id, source_paper, target_paper, candidate in planned:
        if target_row is None:
            # No score row on target yet — empty, no conflict
            continue

        new_score_attr, new_doc_attr, _, _ = _paper_attrs(target_paper)
        target_score_val = getattr(target_row, new_score_attr)
        target_doc_val = getattr(target_row, new_doc_attr)

        occupied = _is_target_occupied(
            target_score_val,
            target_doc_val,
            old_extracted_id=old_extracted_id,
            new_extracted_id=new_extracted_id,
        )
        if occupied:
            if source_row.id == target_row.id and source_paper == target_paper:
                continue
            result.conflicts.append(
                ScoreConflict(
                    index_number=candidate.index_number if candidate else None,
                    candidate_name=candidate.name if candidate else None,
                    existing_score=str(target_score_val)
                    if target_score_val is not None
                    else None,
                    existing_document_id=target_doc_val,
                    subject_score_id=target_row.id,
                )
            )

    if result.conflicts and not overwrite:
        if not dry_run:
            result.blocking_errors.append(
                "Target already has scores; pass overwrite_scores to replace them"
            )
        return result

    if dry_run:
        return result

    for source_row, target_row, target_reg_id, source_paper, target_paper, _candidate in planned:
        if target_row is None:
            assert target_reg_id is not None
            target_row = await _create_score_for_registration(session, target_reg_id)

        old_score_a, old_doc_a, old_method_a, old_norm_a = _paper_attrs(source_paper)
        new_score_a, new_doc_a, new_method_a, new_norm_a = _paper_attrs(target_paper)

        raw = getattr(source_row, old_score_a)
        method = getattr(source_row, old_method_a)
        norm = getattr(source_row, old_norm_a)

        setattr(target_row, new_score_a, raw)
        setattr(target_row, new_doc_a, new_extracted_id)
        setattr(target_row, new_method_a, method)
        setattr(target_row, new_norm_a, norm)
        target_row.updated_at = datetime.utcnow()

        if source_row.id != target_row.id or source_paper != target_paper:
            setattr(source_row, old_score_a, None)
            setattr(source_row, old_doc_a, None)
            setattr(source_row, old_method_a, None)
            setattr(source_row, old_norm_a, None)
            source_row.updated_at = datetime.utcnow()
        elif id_changed:
            setattr(source_row, old_doc_a, new_extracted_id)
            source_row.updated_at = datetime.utcnow()

        result.scores_moved += 1

    return result


async def migrate_subject_scores_for_paper_change(
    session: AsyncSession,
    *,
    old_extracted_id: str,
    new_extracted_id: str,
    old_test_type: str,
    new_test_type: str,
    overwrite: bool = False,
) -> int:
    """Backward-compatible paper-only migrate. Raises ValueError on conflict/block."""
    # Subject unchanged — pass same subject ids as None so subject_changed=False
    migration = await migrate_applied_scores_for_id_change(
        session,
        exam_id=0,  # unused when subject unchanged
        old_extracted_id=old_extracted_id,
        new_extracted_id=new_extracted_id,
        old_test_type=old_test_type,
        new_test_type=new_test_type,
        old_subject_id=None,
        new_subject_id=None,
        overwrite=overwrite,
        dry_run=False,
    )
    if migration.conflicts and not overwrite:
        raise ValueError(
            "Target paper already has scores; cannot overwrite without overwrite flag"
        )
    if migration.blocking_errors:
        raise ValueError("; ".join(migration.blocking_errors))
    return migration.scores_moved


async def reclassify_document_paper(
    session: AsyncSession,
    document: Document,
    target_test_type: str,
    *,
    overwrite: bool = False,
) -> ReclassifyResult:
    """Update document paper/extracted_id and migrate applied scores."""
    if target_test_type not in ("1", "2"):
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=document.extracted_id,
            new_extracted_id=None,
            old_test_type=document.test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error="target_test_type must be 1 (Objectives) or 2 (Essay)",
        )

    if not document.extracted_id or len(document.extracted_id) != 13:
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=document.extracted_id,
            new_extracted_id=None,
            old_test_type=document.test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error="Document has no valid 13-character extracted_id",
        )

    old_extracted_id = document.extracted_id
    old_test_type = document.test_type or old_extracted_id[10:11]

    if old_test_type == target_test_type:
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=old_extracted_id,
            new_extracted_id=old_extracted_id,
            old_test_type=old_test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error="Document is already Paper " + target_test_type,
        )

    try:
        new_extracted_id = rewrite_extracted_id_test_type(old_extracted_id, target_test_type)
    except ValueError as exc:
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=old_extracted_id,
            new_extracted_id=None,
            old_test_type=old_test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error=str(exc),
        )

    conflict_stmt = select(Document).where(
        Document.extracted_id == new_extracted_id,
        Document.exam_id == document.exam_id,
        Document.id != document.id,
        Document.upload_status == "uploaded",
    )
    conflict_result = await session.execute(conflict_stmt)
    conflict_doc = conflict_result.scalar_one_or_none()
    if conflict_doc:
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=old_extracted_id,
            new_extracted_id=new_extracted_id,
            old_test_type=old_test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error=f"Another document (#{conflict_doc.id}) already uses ID {new_extracted_id}",
        )

    migration = await migrate_applied_scores_for_id_change(
        session,
        exam_id=document.exam_id,
        old_extracted_id=old_extracted_id,
        new_extracted_id=new_extracted_id,
        old_test_type=old_test_type,
        new_test_type=target_test_type,
        old_subject_id=document.subject_id,
        new_subject_id=document.subject_id,
        overwrite=overwrite,
        dry_run=False,
    )
    if migration.conflicts and not overwrite:
        first = migration.conflicts[0]
        detail = first.existing_document_id or first.existing_score or "existing value"
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=old_extracted_id,
            new_extracted_id=new_extracted_id,
            old_test_type=old_test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error=f"Target paper already has scores ({detail}); cannot overwrite",
        )
    if migration.blocking_errors:
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=old_extracted_id,
            new_extracted_id=new_extracted_id,
            old_test_type=old_test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error="; ".join(migration.blocking_errors),
        )

    document.extracted_id = new_extracted_id
    document.test_type = target_test_type
    document.test_type_changed_from = old_test_type
    document.test_type_changed_at = datetime.utcnow()

    return ReclassifyResult(
        document_id=document.id,
        old_extracted_id=old_extracted_id,
        new_extracted_id=new_extracted_id,
        old_test_type=old_test_type,
        new_test_type=target_test_type,
        scores_moved=migration.scores_moved,
    )
