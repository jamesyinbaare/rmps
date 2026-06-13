"""Per-subject marking summary: registrations, script allocation, examiner headcount."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationRun,
    AllocationRunStatus,
    ExaminationCandidate,
    ExaminationCandidateSubject,
    Examiner,
    ExaminerSubject,
    Subject,
)
from app.schemas.admin_examiner_marking_summary import AdminExaminerMarkingSubjectSummaryRow


async def _registered_candidates_by_subject(
    session: AsyncSession,
    examination_id: int,
) -> dict[int, int]:
    stmt = (
        select(
            ExaminationCandidateSubject.subject_id,
            func.count(ExaminationCandidateSubject.id),
        )
        .join(
            ExaminationCandidate,
            ExaminationCandidate.id == ExaminationCandidateSubject.examination_candidate_id,
        )
        .where(ExaminationCandidate.examination_id == examination_id)
        .group_by(ExaminationCandidateSubject.subject_id)
    )
    rows = (await session.execute(stmt)).all()
    return {int(subject_id): int(count) for subject_id, count in rows}


async def _allocated_scripts_by_subject(
    session: AsyncSession,
    examination_id: int,
) -> dict[int, int]:
    alloc_stmt = select(Allocation).where(Allocation.examination_id == examination_id)
    allocations = list((await session.execute(alloc_stmt)).scalars().all())

    out: dict[int, int] = {}
    for allocation in allocations:
        subject_id = int(allocation.subject_id)
        run_stmt = (
            select(AllocationRun)
            .where(
                AllocationRun.allocation_id == allocation.id,
                AllocationRun.status == AllocationRunStatus.OPTIMAL,
            )
            .order_by(AllocationRun.created_at.desc())
            .limit(1)
        )
        run = (await session.execute(run_stmt)).scalar_one_or_none()
        if run is None:
            continue

        assign_stmt = (
            select(func.coalesce(func.sum(AllocationAssignment.booklet_count), 0))
            .where(AllocationAssignment.allocation_run_id == run.id)
        )
        total = int((await session.execute(assign_stmt)).scalar_one())
        out[subject_id] = out.get(subject_id, 0) + total
    return out


async def _examiner_count_by_subject(
    session: AsyncSession,
    examination_id: int,
) -> dict[int, int]:
    stmt = (
        select(ExaminerSubject.subject_id, func.count(func.distinct(ExaminerSubject.examiner_id)))
        .join(Examiner, Examiner.id == ExaminerSubject.examiner_id)
        .where(Examiner.examination_id == examination_id)
        .group_by(ExaminerSubject.subject_id)
    )
    rows = (await session.execute(stmt)).all()
    return {int(subject_id): int(count) for subject_id, count in rows}


def merge_subject_marking_summaries(
    *,
    subjects: list[Subject],
    registered: dict[int, int],
    allocated: dict[int, int],
    examiners: dict[int, int],
) -> list[AdminExaminerMarkingSubjectSummaryRow]:
    """Build summary rows for subjects with at least one registration or examiner."""
    subject_ids: set[int] = set()
    subject_ids.update(registered.keys())
    subject_ids.update(allocated.keys())
    subject_ids.update(examiners.keys())

    by_id = {int(s.id): s for s in subjects}
    rows: list[AdminExaminerMarkingSubjectSummaryRow] = []
    for subject_id in sorted(subject_ids):
        sub = by_id.get(subject_id)
        if sub is None:
            continue
        reg = registered.get(subject_id, 0)
        alloc = allocated.get(subject_id, 0)
        ex_count = examiners.get(subject_id, 0)
        if reg == 0 and ex_count == 0 and alloc == 0:
            continue
        code = (sub.original_code or sub.code or "").strip()
        name = (sub.name or "").strip()
        rows.append(
            AdminExaminerMarkingSubjectSummaryRow(
                subject_id=subject_id,
                subject_code=code,
                subject_name=name,
                registered_candidates=reg,
                total_allocated_scripts=alloc,
                examiner_count=ex_count,
                variance=alloc - reg,
            )
        )
    return rows


async def build_examiner_marking_subject_summaries(
    session: AsyncSession,
    examination_id: int,
) -> list[AdminExaminerMarkingSubjectSummaryRow]:
    registered = await _registered_candidates_by_subject(session, examination_id)
    allocated = await _allocated_scripts_by_subject(session, examination_id)
    examiners = await _examiner_count_by_subject(session, examination_id)

    subject_ids = set(registered.keys()) | set(allocated.keys()) | set(examiners.keys())
    if not subject_ids:
        return []

    subjects = list(
        (await session.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars().all()
    )
    return merge_subject_marking_summaries(
        subjects=subjects,
        registered=registered,
        allocated=allocated,
        examiners=examiners,
    )
