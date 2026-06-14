"""Manual vs allocation marking script source per subject."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Allocation,
    Examination,
    ExaminationExaminerManualMarkedScript,
    ExaminationExaminerMarkingRate,
    ExaminationSubjectMarkingScriptSource,
    Examiner,
    ExaminerSubject,
    MarkingScriptSourceMode,
    Subject,
)
from app.services.examiner_allocated_booklets import _marking_source_mode_value
from app.services.school_bulk_upload import inspector_phone_lookup_candidates


async def get_subject_source_mode(
    session: AsyncSession,
    examination_id: int,
    subject_id: int,
) -> MarkingScriptSourceMode:
    row = await session.get(
        ExaminationSubjectMarkingScriptSource,
        {"examination_id": examination_id, "subject_id": subject_id},
    )
    if row is None:
        return MarkingScriptSourceMode.ALLOCATION
    mode = row.source_mode
    if isinstance(mode, MarkingScriptSourceMode):
        return mode
    try:
        return MarkingScriptSourceMode(_marking_source_mode_value(mode))
    except ValueError:
        return MarkingScriptSourceMode.ALLOCATION


async def set_subject_source_mode(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    source_mode: MarkingScriptSourceMode,
    updated_by_user_id: UUID | None = None,
) -> ExaminationSubjectMarkingScriptSource:
    row = await session.get(
        ExaminationSubjectMarkingScriptSource,
        {"examination_id": examination_id, "subject_id": subject_id},
    )
    if row is None:
        row = ExaminationSubjectMarkingScriptSource(
            examination_id=examination_id,
            subject_id=subject_id,
            source_mode=source_mode,
            updated_by_user_id=updated_by_user_id,
        )
        session.add(row)
    else:
        row.source_mode = source_mode
        row.updated_by_user_id = updated_by_user_id
        row.updated_at = datetime.utcnow()
    return row


async def list_papers_for_subject(
    session: AsyncSession,
    examination_id: int,
    subject_id: int,
) -> list[int]:
    alloc_stmt = (
        select(Allocation.paper_number)
        .where(
            Allocation.examination_id == examination_id,
            Allocation.subject_id == subject_id,
        )
        .distinct()
    )
    rate_stmt = (
        select(ExaminationExaminerMarkingRate.paper_number)
        .where(
            ExaminationExaminerMarkingRate.examination_id == examination_id,
            ExaminationExaminerMarkingRate.subject_id == subject_id,
        )
        .distinct()
    )
    alloc_papers = {int(r[0]) for r in (await session.execute(alloc_stmt)).all()}
    rate_papers = {int(r[0]) for r in (await session.execute(rate_stmt)).all()}
    return sorted(alloc_papers | rate_papers)


async def load_examiners_on_subject(
    session: AsyncSession,
    examination_id: int,
    subject_id: int,
) -> list[Examiner]:
    stmt = (
        select(Examiner)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
        )
        .options(selectinload(Examiner.subjects))
        .order_by(Examiner.name.asc())
    )
    return list((await session.execute(stmt)).scalars().all())


def build_phone_to_examiner_map(examiners: list[Examiner]) -> dict[str, UUID]:
    out: dict[str, UUID] = {}
    for ex in examiners:
        phone = (ex.phone_number or "").strip()
        if not phone:
            continue
        for candidate in inspector_phone_lookup_candidates(phone):
            out[candidate] = ex.id
    return out


async def upsert_manual_marked_scripts(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    paper_number: int,
    items: list[tuple[UUID, int]],
    updated_by_user_id: UUID | None = None,
) -> None:
    for examiner_id, script_count in items:
        if script_count < 0:
            raise ValueError("script_count must be >= 0")
        row = await session.get(
            ExaminationExaminerManualMarkedScript,
            {
                "examination_id": examination_id,
                "subject_id": subject_id,
                "examiner_id": examiner_id,
                "paper_number": paper_number,
            },
        )
        if row is None:
            row = ExaminationExaminerManualMarkedScript(
                examination_id=examination_id,
                subject_id=subject_id,
                examiner_id=examiner_id,
                paper_number=paper_number,
                script_count=script_count,
            )
            session.add(row)
        else:
            row.script_count = script_count
            row.updated_at = datetime.utcnow()

    await set_subject_source_mode(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        source_mode=MarkingScriptSourceMode.MANUAL,
        updated_by_user_id=updated_by_user_id,
    )


async def assert_examination_subject(
    session: AsyncSession,
    examination_id: int,
    subject_id: int,
) -> tuple[Examination, Subject]:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise ValueError("Subject not found")
    return exam, subject
