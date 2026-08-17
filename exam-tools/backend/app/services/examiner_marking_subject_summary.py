"""Per-subject marking summary: registrations, script allocation, examiner headcount."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Allocation,
    ExaminationCandidate,
    ExaminationCandidateSubject,
    Examiner,
    ExaminerSubject,
    Subject,
)
from app.schemas.admin_examiner_marking_summary import (
    AdminExaminerMarkingSubjectPaperSummary,
    AdminExaminerMarkingSubjectSummaryRow,
)
from app.services.examiner_allocated_booklets import load_effective_allocated_booklets_map


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


async def _allocated_scripts_by_subject_paper(
    session: AsyncSession,
    examination_id: int,
) -> dict[tuple[int, int], int]:
    """(subject_id, paper_number) → allocated booklet count."""
    effective_map = await load_effective_allocated_booklets_map(session, examination_id)
    out: dict[tuple[int, int], int] = {}
    for (_examiner_id, subject_id, paper), count in effective_map.items():
        key = (int(subject_id), int(paper))
        out[key] = out.get(key, 0) + int(count)
    return out


async def _campaign_papers_by_subject(
    session: AsyncSession,
    examination_id: int,
) -> dict[int, set[int]]:
    """Paper numbers that have allocation campaigns for this exam, even if none allocated yet."""
    stmt = select(Allocation.subject_id, Allocation.paper_number).where(
        Allocation.examination_id == examination_id
    )
    out: dict[int, set[int]] = {}
    for subject_id, paper_number in (await session.execute(stmt)).all():
        sid = int(subject_id)
        out.setdefault(sid, set()).add(int(paper_number))
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


def _paper_summaries_for_subject(
    *,
    registered: int,
    paper_numbers: list[int],
    allocated_by_paper: dict[int, int],
) -> list[AdminExaminerMarkingSubjectPaperSummary]:
    papers: list[AdminExaminerMarkingSubjectPaperSummary] = []
    for paper in paper_numbers:
        alloc = int(allocated_by_paper.get(paper, 0))
        papers.append(
            AdminExaminerMarkingSubjectPaperSummary(
                paper_number=paper,
                registered_candidates=registered,
                allocated_scripts=alloc,
                variance=alloc - registered,
            )
        )
    return papers


def merge_subject_marking_summaries(
    *,
    subjects: list[Subject],
    registered: dict[int, int],
    allocated_by_subject_paper: dict[tuple[int, int], int],
    examiners: dict[int, int],
    campaign_papers: dict[int, set[int]] | None = None,
) -> list[AdminExaminerMarkingSubjectSummaryRow]:
    """Build summary rows for subjects with at least one registration or examiner."""
    campaigns = campaign_papers or {}
    subject_ids: set[int] = set()
    subject_ids.update(registered.keys())
    subject_ids.update(examiners.keys())
    subject_ids.update(sid for sid, _paper in allocated_by_subject_paper)
    subject_ids.update(campaigns.keys())

    by_id = {int(s.id): s for s in subjects}
    rows: list[AdminExaminerMarkingSubjectSummaryRow] = []
    for subject_id in sorted(subject_ids):
        sub = by_id.get(subject_id)
        if sub is None:
            continue
        reg = registered.get(subject_id, 0)
        ex_count = examiners.get(subject_id, 0)
        paper_set: set[int] = set(campaigns.get(subject_id, set()))
        allocated_by_paper: dict[int, int] = {}
        for (sid, paper), count in allocated_by_subject_paper.items():
            if sid != subject_id:
                continue
            paper_set.add(paper)
            allocated_by_paper[paper] = count
        # Fallback when nothing is allocated yet: treat as a single paper so older
        # callers still get a sensible row; UI merges timetable paper numbers.
        if not paper_set and (reg > 0 or ex_count > 0):
            paper_set.add(1)
        paper_numbers = sorted(paper_set)
        papers = _paper_summaries_for_subject(
            registered=reg,
            paper_numbers=paper_numbers,
            allocated_by_paper=allocated_by_paper,
        )
        alloc_total = sum(p.allocated_scripts for p in papers)
        variance_total = sum(p.variance for p in papers)
        if reg == 0 and ex_count == 0 and alloc_total == 0:
            continue
        code = (sub.original_code or sub.code or "").strip()
        name = (sub.name or "").strip()
        rows.append(
            AdminExaminerMarkingSubjectSummaryRow(
                subject_id=subject_id,
                subject_code=code,
                subject_name=name,
                registered_candidates=reg,
                total_allocated_scripts=alloc_total,
                examiner_count=ex_count,
                variance=variance_total,
                papers=papers,
            )
        )
    return rows


async def build_examiner_marking_subject_summaries(
    session: AsyncSession,
    examination_id: int,
) -> list[AdminExaminerMarkingSubjectSummaryRow]:
    registered = await _registered_candidates_by_subject(session, examination_id)
    allocated_by_subject_paper = await _allocated_scripts_by_subject_paper(session, examination_id)
    examiners = await _examiner_count_by_subject(session, examination_id)
    campaign_papers = await _campaign_papers_by_subject(session, examination_id)

    subject_ids = (
        set(registered.keys())
        | set(examiners.keys())
        | {sid for sid, _p in allocated_by_subject_paper}
        | set(campaign_papers.keys())
    )
    if not subject_ids:
        return []

    subjects = list(
        (await session.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars().all()
    )
    return merge_subject_marking_summaries(
        subjects=subjects,
        registered=registered,
        allocated_by_subject_paper=allocated_by_subject_paper,
        examiners=examiners,
        campaign_papers=campaign_papers,
    )
