"""Candidate-derived centre-ops queries that union imported + irregular candidates."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import distinct, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminationCandidate,
    ExaminationCandidateSubject,
    IrregularExaminationCandidate,
    IrregularExaminationCandidateSubject,
    School,
)
from sqlalchemy import or_


async def get_candidate_schedule_codes_for_exam(
    session: AsyncSession,
    exam_id: int,
    scope_school_ids: set[UUID],
    *,
    programme_id: int | None = None,
    filter_school_id: UUID | None = None,
) -> set[str]:
    """
    Distinct subject codes from imported and irregular candidates in scope.
    Candidates with null school_id are excluded (imported only).
    """
    school_ids: set[UUID] = set(scope_school_ids)
    if filter_school_id is not None:
        school_ids = {filter_school_id}
    if not school_ids:
        return set()

    imported_stmt = (
        select(ExaminationCandidateSubject.subject_code)
        .join(
            ExaminationCandidate,
            ExaminationCandidateSubject.examination_candidate_id == ExaminationCandidate.id,
        )
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.isnot(None),
            ExaminationCandidate.school_id.in_(school_ids),
        )
    )
    if programme_id is not None:
        imported_stmt = imported_stmt.where(ExaminationCandidate.programme_id == programme_id)

    irregular_stmt = (
        select(IrregularExaminationCandidateSubject.subject_code)
        .join(
            IrregularExaminationCandidate,
            IrregularExaminationCandidateSubject.irregular_examination_candidate_id
            == IrregularExaminationCandidate.id,
        )
        .where(
            IrregularExaminationCandidate.examination_id == exam_id,
            IrregularExaminationCandidate.school_id.in_(school_ids),
        )
    )
    if programme_id is not None:
        irregular_stmt = irregular_stmt.where(
            IrregularExaminationCandidate.programme_id == programme_id
        )

    out: set[str] = set()
    for stmt in (imported_stmt.distinct(), irregular_stmt.distinct()):
        result = await session.execute(stmt)
        for (code,) in result.all():
            if code:
                out.add(str(code).strip())
    return out


async def count_candidates_in_scope(
    session: AsyncSession,
    exam_id: int,
    scope_school_ids: set[UUID],
) -> int:
    if not scope_school_ids:
        return 0
    imported = int(
        (
            await session.execute(
                select(func.count())
                .select_from(ExaminationCandidate)
                .where(
                    ExaminationCandidate.examination_id == exam_id,
                    ExaminationCandidate.school_id.in_(scope_school_ids),
                )
            )
        ).scalar_one()
    )
    irregular = int(
        (
            await session.execute(
                select(func.count())
                .select_from(IrregularExaminationCandidate)
                .where(
                    IrregularExaminationCandidate.examination_id == exam_id,
                    IrregularExaminationCandidate.school_id.in_(scope_school_ids),
                )
            )
        ).scalar_one()
    )
    return imported + irregular


async def candidate_counts_by_school(
    session: AsyncSession,
    exam_id: int,
    scope_school_ids: set[UUID],
) -> dict[UUID, int]:
    if not scope_school_ids:
        return {}
    out: dict[UUID, int] = {}
    imported_rows = await session.execute(
        select(ExaminationCandidate.school_id, func.count().label("candidate_count"))
        .where(
            ExaminationCandidate.examination_id == exam_id,
            ExaminationCandidate.school_id.in_(scope_school_ids),
        )
        .group_by(ExaminationCandidate.school_id)
    )
    for school_id, cnt in imported_rows.all():
        if school_id is not None:
            out[school_id] = int(cnt)

    irregular_rows = await session.execute(
        select(IrregularExaminationCandidate.school_id, func.count().label("candidate_count"))
        .where(
            IrregularExaminationCandidate.examination_id == exam_id,
            IrregularExaminationCandidate.school_id.in_(scope_school_ids),
        )
        .group_by(IrregularExaminationCandidate.school_id)
    )
    for school_id, cnt in irregular_rows.all():
        out[school_id] = out.get(school_id, 0) + int(cnt)
    return out


async def schools_with_subject_registrations(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    region=None,
    zone=None,
    school_q: str | None = None,
) -> list[tuple[School, int]]:
    """Schools with at least one imported or irregular candidate for subject."""
    imported_stmt = (
        select(
            School.id.label("school_id"),
            func.count(distinct(ExaminationCandidate.id)).label("candidate_count"),
        )
        .select_from(School)
        .join(ExaminationCandidate, ExaminationCandidate.school_id == School.id)
        .join(
            ExaminationCandidateSubject,
            ExaminationCandidateSubject.examination_candidate_id == ExaminationCandidate.id,
        )
        .where(
            ExaminationCandidate.examination_id == examination_id,
            ExaminationCandidate.school_id.isnot(None),
            ExaminationCandidateSubject.subject_id == subject_id,
        )
        .group_by(School.id)
    )
    irregular_stmt = (
        select(
            School.id.label("school_id"),
            func.count(distinct(IrregularExaminationCandidate.id)).label("candidate_count"),
        )
        .select_from(School)
        .join(IrregularExaminationCandidate, IrregularExaminationCandidate.school_id == School.id)
        .join(
            IrregularExaminationCandidateSubject,
            IrregularExaminationCandidateSubject.irregular_examination_candidate_id
            == IrregularExaminationCandidate.id,
        )
        .where(
            IrregularExaminationCandidate.examination_id == examination_id,
            IrregularExaminationCandidateSubject.subject_id == subject_id,
        )
        .group_by(School.id)
    )

    if region is not None:
        imported_stmt = imported_stmt.where(School.region == region)
        irregular_stmt = irregular_stmt.where(School.region == region)
    if zone is not None:
        imported_stmt = imported_stmt.where(School.zone == zone)
        irregular_stmt = irregular_stmt.where(School.zone == zone)
    if school_q and school_q.strip():
        pattern = f"%{school_q.strip()}%"
        school_filter = or_(School.code.ilike(pattern), School.name.ilike(pattern))
        imported_stmt = imported_stmt.where(school_filter)
        irregular_stmt = irregular_stmt.where(school_filter)

    counts: dict[UUID, int] = {}
    for stmt in (imported_stmt, irregular_stmt):
        for school_id, cnt in (await session.execute(stmt)).all():
            counts[school_id] = counts.get(school_id, 0) + int(cnt)

    if not counts:
        return []

    schools_result = await session.execute(
        select(School).where(School.id.in_(counts.keys())).order_by(School.code)
    )
    schools = list(schools_result.scalars().all())
    return [(school, counts[school.id]) for school in schools]


async def registered_candidates_by_exam_school_subject(
    session: AsyncSession,
    triples: list[tuple[int, UUID, int]],
) -> dict[str, int]:
    """Distinct candidate counts per (examination, school, subject) for packing rows."""
    if not triples:
        return {}
    out: dict[str, int] = {}

    reg_stmt = (
        select(
            ExaminationCandidate.examination_id,
            ExaminationCandidate.school_id,
            ExaminationCandidateSubject.subject_id,
            func.count(distinct(ExaminationCandidate.id)),
        )
        .select_from(ExaminationCandidate)
        .join(
            ExaminationCandidateSubject,
            ExaminationCandidateSubject.examination_candidate_id == ExaminationCandidate.id,
        )
        .where(
            ExaminationCandidate.school_id.isnot(None),
            ExaminationCandidateSubject.subject_id.isnot(None),
            tuple_(
                ExaminationCandidate.examination_id,
                ExaminationCandidate.school_id,
                ExaminationCandidateSubject.subject_id,
            ).in_(triples),
        )
        .group_by(
            ExaminationCandidate.examination_id,
            ExaminationCandidate.school_id,
            ExaminationCandidateSubject.subject_id,
        )
    )
    for exam_id, sch_id, sub_id, cnt in (await session.execute(reg_stmt)).all():
        key = f"{exam_id}:{sch_id}:{sub_id}"
        out[key] = int(cnt)

    irr_stmt = (
        select(
            IrregularExaminationCandidate.examination_id,
            IrregularExaminationCandidate.school_id,
            IrregularExaminationCandidateSubject.subject_id,
            func.count(distinct(IrregularExaminationCandidate.id)),
        )
        .select_from(IrregularExaminationCandidate)
        .join(
            IrregularExaminationCandidateSubject,
            IrregularExaminationCandidateSubject.irregular_examination_candidate_id
            == IrregularExaminationCandidate.id,
        )
        .where(
            IrregularExaminationCandidateSubject.subject_id.isnot(None),
            tuple_(
                IrregularExaminationCandidate.examination_id,
                IrregularExaminationCandidate.school_id,
                IrregularExaminationCandidateSubject.subject_id,
            ).in_(triples),
        )
        .group_by(
            IrregularExaminationCandidate.examination_id,
            IrregularExaminationCandidate.school_id,
            IrregularExaminationCandidateSubject.subject_id,
        )
    )
    for exam_id, sch_id, sub_id, cnt in (await session.execute(irr_stmt)).all():
        key = f"{exam_id}:{sch_id}:{sub_id}"
        out[key] = out.get(key, 0) + int(cnt)
    return out
