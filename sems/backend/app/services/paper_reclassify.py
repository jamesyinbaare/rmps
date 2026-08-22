"""Reclassify document paper (test_type) and migrate applied SubjectScore fields."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, SubjectScore

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


def rewrite_extracted_id_test_type(extracted_id: str, target_test_type: str) -> str:
    if len(extracted_id) != 13:
        raise ValueError("extracted_id must be exactly 13 characters")
    if target_test_type not in ("1", "2"):
        raise ValueError("target_test_type must be 1 or 2")
    return extracted_id[:10] + target_test_type + extracted_id[11:]


def _paper_attrs(test_type: str) -> tuple[str, str, str, str]:
    attrs = PAPER_ATTRS.get(test_type)
    if not attrs:
        raise ValueError(f"Unsupported test_type: {test_type}")
    return attrs


async def migrate_subject_scores_for_paper_change(
    session: AsyncSession,
    *,
    old_extracted_id: str,
    new_extracted_id: str,
    old_test_type: str,
    new_test_type: str,
) -> int:
    """Move score columns from old paper to new paper for rows linked to this sheet.

    Returns number of SubjectScore rows updated.
    Raises ValueError on conflict (target paper already occupied by another sheet).
    """
    if old_test_type == new_test_type:
        return 0

    old_score, old_doc, old_method, old_norm = _paper_attrs(old_test_type)
    new_score, new_doc, new_method, new_norm = _paper_attrs(new_test_type)

    stmt = select(SubjectScore).where(getattr(SubjectScore, old_doc) == old_extracted_id)
    result = await session.execute(stmt)
    rows = list(result.scalars().all())

    for row in rows:
        target_doc_id = getattr(row, new_doc)
        target_score = getattr(row, new_score)
        if target_doc_id and target_doc_id not in (old_extracted_id, new_extracted_id):
            raise ValueError(
                f"Target paper already has scores from sheet {target_doc_id}; "
                "cannot overwrite"
            )
        if target_score is not None and not target_doc_id:
            raise ValueError(
                "Target paper already has a score value; cannot overwrite"
            )
        if (
            target_score is not None
            and target_doc_id
            and target_doc_id not in (old_extracted_id, new_extracted_id)
        ):
            raise ValueError(
                "Target paper already has a score value from another sheet; cannot overwrite"
            )

    moved = 0
    for row in rows:
        setattr(row, new_score, getattr(row, old_score))
        setattr(row, new_doc, new_extracted_id)
        setattr(row, new_method, getattr(row, old_method))
        setattr(row, new_norm, getattr(row, old_norm))

        setattr(row, old_score, None)
        setattr(row, old_doc, None)
        setattr(row, old_method, None)
        setattr(row, old_norm, None)
        row.updated_at = datetime.utcnow()
        moved += 1

    return moved


async def reclassify_document_paper(
    session: AsyncSession,
    document: Document,
    target_test_type: str,
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

    # Conflict: another document already owns the new ID in this exam
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

    try:
        scores_moved = await migrate_subject_scores_for_paper_change(
            session,
            old_extracted_id=old_extracted_id,
            new_extracted_id=new_extracted_id,
            old_test_type=old_test_type,
            new_test_type=target_test_type,
        )
    except ValueError as exc:
        return ReclassifyResult(
            document_id=document.id,
            old_extracted_id=old_extracted_id,
            new_extracted_id=new_extracted_id,
            old_test_type=old_test_type,
            new_test_type=target_test_type,
            scores_moved=0,
            error=str(exc),
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
        scores_moved=scores_moved,
    )
