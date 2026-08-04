"""Create and pack validation-issue batches (DOC/NOD streams)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Document,
    Exam,
    ExamSubject,
    IssueBatch,
    Subject,
    SubjectScore,
    SubjectScoreValidationIssue,
    ValidationIssueStatus,
)

logger = logging.getLogger(__name__)

DEFAULT_TARGET_SIZE = 500
DEFAULT_TOLERANCE = 50


@dataclass
class SheetGroup:
    document_id: str | None
    issue_ids: list[int] = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.issue_ids)


@dataclass
class CreatedBatchInfo:
    id: int
    name: str
    issue_count: int
    has_document: bool
    oversized: bool = False


def document_field_for_test_type(test_type: int) -> str:
    if test_type == 1:
        return "obj_document_id"
    if test_type == 2:
        return "essay_document_id"
    if test_type == 3:
        return "pract_document_id"
    raise ValueError(f"Invalid test_type: {test_type}")


def get_score_document_id(score: SubjectScore, test_type: int) -> str | None:
    if test_type == 1:
        return score.obj_document_id
    if test_type == 2:
        return score.essay_document_id
    if test_type == 3:
        return score.pract_document_id
    return None


async def assigned_document_extracted_ids(
    session: AsyncSession,
    user_id: UUID,
) -> set[str]:
    """
    Distinct Document.extracted_id values linked to batches assigned to the user.

    Join: IssueBatch (assignee) → validation issues → SubjectScore →
    obj/essay/pract_document_id selected by issue.test_type.
    """
    stmt = (
        select(
            SubjectScoreValidationIssue.test_type,
            SubjectScore.obj_document_id,
            SubjectScore.essay_document_id,
            SubjectScore.pract_document_id,
        )
        .join(IssueBatch, SubjectScoreValidationIssue.batch_id == IssueBatch.id)
        .join(SubjectScore, SubjectScoreValidationIssue.subject_score_id == SubjectScore.id)
        .where(IssueBatch.assigned_to_user_id == user_id)
    )
    rows = (await session.execute(stmt)).all()
    ids: set[str] = set()
    for test_type, obj_id, essay_id, pract_id in rows:
        if test_type == 1 and obj_id:
            ids.add(obj_id)
        elif test_type == 2 and essay_id:
            ids.add(essay_id)
        elif test_type == 3 and pract_id:
            ids.add(pract_id)
    return ids


async def clerk_may_access_extracted_id(
    session: AsyncSession,
    user_id: UUID,
    extracted_id: str | None,
) -> bool:
    if not extracted_id:
        return False
    assigned = await assigned_document_extracted_ids(session, user_id)
    return extracted_id in assigned


async def clerk_may_access_score(
    session: AsyncSession,
    user_id: UUID,
    subject_score: SubjectScore,
) -> bool:
    """Allow if any of the score's sheet IDs is in the clerk's assigned document set."""
    assigned = await assigned_document_extracted_ids(session, user_id)
    if not assigned:
        return False
    for doc_id in (
        subject_score.obj_document_id,
        subject_score.essay_document_id,
        subject_score.pract_document_id,
    ):
        if doc_id and doc_id in assigned:
            return True
    return False


def pack_groups(
    groups: list[SheetGroup],
    target_size: int,
    tolerance: int,
) -> list[tuple[list[SheetGroup], bool]]:
    """
    Pack sheet-groups in given order into batches.

    Returns list of (groups_in_batch, oversized).
    """
    if not groups:
        return []

    hard_max = target_size + tolerance
    soft_min = max(1, target_size - tolerance)
    batches: list[tuple[list[SheetGroup], bool]] = []
    current: list[SheetGroup] = []
    current_size = 0

    for group in groups:
        if group.size > hard_max:
            if current:
                batches.append((current, False))
                current = []
                current_size = 0
            batches.append(([group], True))
            continue

        if current and current_size + group.size > hard_max:
            batches.append((current, False))
            current = [group]
            current_size = group.size
            continue

        # Prefer closing when already in [T-tol, T+tol] and next would exceed soft comfort
        if (
            current
            and current_size >= soft_min
            and current_size + group.size > target_size
            and current_size + group.size > hard_max
        ):
            batches.append((current, False))
            current = [group]
            current_size = group.size
            continue

        if current and current_size >= soft_min and current_size + group.size > hard_max:
            batches.append((current, False))
            current = [group]
            current_size = group.size
            continue

        current.append(group)
        current_size += group.size

    if current:
        batches.append((current, False))

    return batches


async def _next_batch_no(
    session: AsyncSession,
    exam_id: int,
    subject_id: int,
    test_type: int,
    has_document: bool,
) -> int:
    prefix_tag = "DOC" if has_document else "NOD"
    # Count existing batches for this stream
    count_result = await session.execute(
        select(func.count())
        .select_from(IssueBatch)
        .where(
            IssueBatch.exam_id == exam_id,
            IssueBatch.subject_id == subject_id,
            IssueBatch.test_type == test_type,
            IssueBatch.has_document.is_(has_document),
        )
    )
    existing = count_result.scalar() or 0
    # Also parse max suffix from names in case of gaps
    name_result = await session.execute(
        select(IssueBatch.name).where(
            IssueBatch.exam_id == exam_id,
            IssueBatch.subject_id == subject_id,
            IssueBatch.test_type == test_type,
            IssueBatch.has_document.is_(has_document),
        )
    )
    max_no = existing
    for (name,) in name_result.all():
        try:
            suffix = name.rsplit("_", 1)[-1]
            max_no = max(max_no, int(suffix))
        except (ValueError, IndexError):
            continue
    _ = prefix_tag  # naming uses DOC/NOD in caller
    return max_no + 1


async def create_batches(
    session: AsyncSession,
    *,
    exam_id: int,
    subject_id: int,
    test_type: int,
    created_by_user_id: UUID,
    target_size: int = DEFAULT_TARGET_SIZE,
    tolerance: int = DEFAULT_TOLERANCE,
    has_document_filter: bool | None = None,
) -> dict:
    """
    Create batches for pending unbatched issues in one exam/subject/test_type.

    has_document_filter:
      - True: DOC stream only
      - False: NOD stream only
      - None: both streams
    """
    if test_type not in (1, 2, 3):
        raise ValueError("test_type must be 1, 2, or 3")
    if target_size < 1:
        raise ValueError("target_size must be >= 1")
    if tolerance < 0:
        raise ValueError("tolerance must be >= 0")

    exam = (await session.execute(select(Exam).where(Exam.id == exam_id))).scalar_one_or_none()
    if not exam:
        raise LookupError(f"Exam {exam_id} not found")
    subject = (
        await session.execute(select(Subject).where(Subject.id == subject_id))
    ).scalar_one_or_none()
    if not subject:
        raise LookupError(f"Subject {subject_id} not found")

    # Load pending unbatched issues for this exam+subject+test_type
    stmt = (
        select(SubjectScoreValidationIssue, SubjectScore)
        .join(SubjectScore, SubjectScoreValidationIssue.subject_score_id == SubjectScore.id)
        .join(ExamSubject, SubjectScoreValidationIssue.exam_subject_id == ExamSubject.id)
        .where(
            SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING,
            SubjectScoreValidationIssue.batch_id.is_(None),
            SubjectScoreValidationIssue.test_type == test_type,
            ExamSubject.exam_id == exam_id,
            ExamSubject.subject_id == subject_id,
        )
        .order_by(SubjectScoreValidationIssue.id.asc())
    )
    rows = (await session.execute(stmt)).all()
    if not rows:
        return {
            "batches": [],
            "oversized_groups": [],
            "created_doc_count": 0,
            "created_nod_count": 0,
        }

    # Successful document ids for this exam
    success_docs = (
        await session.execute(
            select(Document.extracted_id).where(
                Document.exam_id == exam_id,
                Document.id_extraction_status == "success",
                Document.extracted_id.is_not(None),
            )
        )
    ).scalars().all()
    success_set = {d for d in success_docs if d}

    doc_groups: dict[str, SheetGroup] = {}
    nod_groups: dict[str, SheetGroup] = {}

    for issue, score in rows:
        doc_id = get_score_document_id(score, test_type)
        has_doc = bool(doc_id and doc_id in success_set)
        if has_doc:
            key = doc_id  # type: ignore[assignment]
            group = doc_groups.get(key)
            if group is None:
                group = SheetGroup(document_id=doc_id)
                doc_groups[key] = group
            group.issue_ids.append(issue.id)
        else:
            key = doc_id if doc_id else f"orphan:{issue.id}"
            group = nod_groups.get(key)
            if group is None:
                group = SheetGroup(document_id=doc_id)
                nod_groups[key] = group
            group.issue_ids.append(issue.id)

    def sort_groups(groups_map: dict[str, SheetGroup]) -> list[SheetGroup]:
        with_id = [g for g in groups_map.values() if g.document_id]
        orphans = [g for g in groups_map.values() if not g.document_id]
        with_id.sort(key=lambda g: g.document_id or "")
        orphans.sort(key=lambda g: g.issue_ids[0] if g.issue_ids else 0)
        return with_id + orphans

    streams: list[tuple[bool, list[SheetGroup]]] = []
    if has_document_filter is None or has_document_filter is True:
        streams.append((True, sort_groups(doc_groups)))
    if has_document_filter is None or has_document_filter is False:
        streams.append((False, sort_groups(nod_groups)))

    created: list[CreatedBatchInfo] = []
    oversized_groups: list[dict] = []
    created_doc_count = 0
    created_nod_count = 0
    subject_code = subject.code.replace(" ", "")[:20]

    for has_document, groups in streams:
        if not groups:
            continue
        packed = pack_groups(groups, target_size, tolerance)
        next_no = await _next_batch_no(session, exam_id, subject_id, test_type, has_document)
        tag = "DOC" if has_document else "NOD"

        for batch_groups, oversized in packed:
            issue_ids: list[int] = []
            for g in batch_groups:
                issue_ids.extend(g.issue_ids)
                if oversized:
                    oversized_groups.append(
                        {
                            "document_id": g.document_id,
                            "issue_count": g.size,
                            "has_document": has_document,
                        }
                    )

            name = f"{exam.year}_{subject_code}_{test_type}_{tag}_{next_no:03d}"
            next_no += 1

            batch = IssueBatch(
                name=name,
                exam_id=exam_id,
                subject_id=subject_id,
                test_type=test_type,
                has_document=has_document,
                target_size=target_size,
                tolerance=tolerance,
                issue_count=len(issue_ids),
                created_by_user_id=created_by_user_id,
                created_at=datetime.utcnow(),
            )
            session.add(batch)
            await session.flush()

            await session.execute(
                update(SubjectScoreValidationIssue)
                .where(SubjectScoreValidationIssue.id.in_(issue_ids))
                .values(batch_id=batch.id, updated_at=datetime.utcnow())
            )

            info = CreatedBatchInfo(
                id=batch.id,
                name=batch.name,
                issue_count=batch.issue_count,
                has_document=has_document,
                oversized=oversized,
            )
            created.append(info)
            if has_document:
                created_doc_count += 1
            else:
                created_nod_count += 1

    await session.commit()
    logger.info(
        "Created %s batches (DOC=%s NOD=%s) for exam=%s subject=%s test_type=%s",
        len(created),
        created_doc_count,
        created_nod_count,
        exam_id,
        subject_id,
        test_type,
    )
    return {
        "batches": [
            {
                "id": b.id,
                "name": b.name,
                "issue_count": b.issue_count,
                "has_document": b.has_document,
                "oversized": b.oversized,
            }
            for b in created
        ],
        "oversized_groups": oversized_groups,
        "created_doc_count": created_doc_count,
        "created_nod_count": created_nod_count,
    }


async def clear_batches(
    session: AsyncSession,
    *,
    exam_id: int,
    subject_id: int,
    test_type: int,
) -> dict:
    """
    Delete IssueBatch rows for exam+subject+test_type.

    Pending issues in those batches are unbatched (batch_id=NULL) so they can
    be re-packed. Resolved/ignored issue rows are never deleted; attribution
    fields are left intact. Deleting batches nulls batch_id via FK ON DELETE SET NULL.
    """
    if test_type not in (1, 2, 3):
        raise ValueError("test_type must be 1, 2, or 3")

    batch_ids = (
        await session.execute(
            select(IssueBatch.id).where(
                IssueBatch.exam_id == exam_id,
                IssueBatch.subject_id == subject_id,
                IssueBatch.test_type == test_type,
            )
        )
    ).scalars().all()

    if not batch_ids:
        return {
            "batches_deleted": 0,
            "pending_unbatched": 0,
            "resolved_preserved": 0,
        }

    pending_count = (
        await session.execute(
            select(func.count())
            .select_from(SubjectScoreValidationIssue)
            .where(
                SubjectScoreValidationIssue.batch_id.in_(batch_ids),
                SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING,
            )
        )
    ).scalar() or 0

    resolved_preserved = (
        await session.execute(
            select(func.count())
            .select_from(SubjectScoreValidationIssue)
            .where(
                SubjectScoreValidationIssue.batch_id.in_(batch_ids),
                SubjectScoreValidationIssue.status.in_(
                    [ValidationIssueStatus.RESOLVED, ValidationIssueStatus.IGNORED]
                ),
            )
        )
    ).scalar() or 0

    await session.execute(
        update(SubjectScoreValidationIssue)
        .where(
            SubjectScoreValidationIssue.batch_id.in_(batch_ids),
            SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING,
        )
        .values(batch_id=None, updated_at=datetime.utcnow())
    )

    await session.execute(delete(IssueBatch).where(IssueBatch.id.in_(batch_ids)))
    await session.commit()

    logger.info(
        "Cleared %s batches for exam=%s subject=%s test_type=%s "
        "(pending_unbatched=%s resolved_preserved=%s)",
        len(batch_ids),
        exam_id,
        subject_id,
        test_type,
        pending_count,
        resolved_preserved,
    )
    return {
        "batches_deleted": len(batch_ids),
        "pending_unbatched": pending_count,
        "resolved_preserved": resolved_preserved,
    }
