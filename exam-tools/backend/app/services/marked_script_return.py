"""Marking-centre marked script return verification."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationRun,
    AllocationRunStatus,
    Examiner,
    ExaminerMarkedScriptReturn,
    ExaminerSubject,
    ExaminerType,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
    User,
)
from app.schemas.subject_officer import MarkedScriptReturnStatusSchema
from app.services.subject_marking_group import get_examiner_marking_group


def _examiner_type_label(examiner_type: ExaminerType) -> str:
    return {
        ExaminerType.CHIEF: "Chief examiner",
        ExaminerType.ASSISTANT: "Assistant examiner",
        ExaminerType.TEAM_LEADER: "Team leader",
    }[examiner_type]


def _row_status(_expected: int, _returned: int | None, verified_at: datetime | None) -> str:
    if verified_at is not None:
        return MarkedScriptReturnStatusSchema.verified.value
    return MarkedScriptReturnStatusSchema.pending.value


async def _latest_optimal_run_id(
    session: AsyncSession,
    *,
    allocation_id: UUID,
    examiner_id: UUID,
) -> UUID | None:
    run_stmt = (
        select(AllocationRun.id)
        .where(
            AllocationRun.allocation_id == allocation_id,
            AllocationRun.status == AllocationRunStatus.OPTIMAL,
            AllocationRun.id.in_(
                select(AllocationAssignment.allocation_run_id).where(
                    AllocationAssignment.examiner_id == examiner_id
                )
            ),
        )
        .order_by(AllocationRun.created_at.desc())
        .limit(1)
    )
    return (await session.execute(run_stmt)).scalar_one_or_none()


async def _load_subject_allocations(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> tuple[list[Allocation], str, str]:
    from app.models import Subject

    alloc_stmt = (
        select(Allocation)
        .where(Allocation.examination_id == examination_id, Allocation.subject_id == subject_id)
        .options(selectinload(Allocation.subject))
        .order_by(Allocation.paper_number)
    )
    allocations = list((await session.execute(alloc_stmt)).scalars().all())
    subject = allocations[0].subject if allocations else await session.get(Subject, subject_id)
    subject_code = subject.code if subject else ""
    subject_name = subject.name if subject else ""
    return allocations, subject_code, subject_name


async def _load_existing_returns_by_assignment(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> dict[UUID, ExaminerMarkedScriptReturn]:
    existing_stmt = select(ExaminerMarkedScriptReturn).where(
        ExaminerMarkedScriptReturn.examination_id == examination_id,
        ExaminerMarkedScriptReturn.subject_id == subject_id,
    )
    existing_rows = list((await session.execute(existing_stmt)).scalars().all())
    return {r.allocation_assignment_id: r for r in existing_rows}


async def _envelope_rows_for_examiner_paper(
    session: AsyncSession,
    *,
    allocations: list[Allocation],
    examiner: Examiner,
    paper_number: int,
    existing_by_assignment: dict[UUID, ExaminerMarkedScriptReturn],
) -> list[dict]:
    allocation = next((a for a in allocations if int(a.paper_number) == paper_number), None)
    if allocation is None:
        return []

    run_id = await _latest_optimal_run_id(
        session,
        allocation_id=allocation.id,
        examiner_id=examiner.id,
    )
    if run_id is None:
        return []

    assign_stmt = (
        select(
            AllocationAssignment,
            ScriptEnvelope,
            ScriptPackingSeries,
            School,
        )
        .join(ScriptEnvelope, ScriptEnvelope.id == AllocationAssignment.script_envelope_id)
        .join(ScriptPackingSeries, ScriptPackingSeries.id == ScriptEnvelope.packing_series_id)
        .join(School, School.id == ScriptPackingSeries.school_id)
        .where(
            AllocationAssignment.allocation_run_id == run_id,
            AllocationAssignment.examiner_id == examiner.id,
        )
    )
    assignments = list((await session.execute(assign_stmt)).all())
    rows: list[dict] = []
    for assignment, env, series, school in assignments:
        expected = int(assignment.booklet_count)
        if expected <= 0:
            continue
        record = existing_by_assignment.get(assignment.id)
        returned = record.returned_booklets if record else None
        verified_at = record.verified_at if record else None
        status_val = _row_status(expected, returned, verified_at)
        rows.append(
            {
                "allocation_assignment_id": assignment.id,
                "examiner_id": examiner.id,
                "examiner_name": examiner.name,
                "examiner_type": _examiner_type_label(examiner.examiner_type),
                "paper_number": int(allocation.paper_number),
                "allocation_run_id": run_id,
                "school_code": school.code,
                "school_name": school.name,
                "envelope_number": int(env.envelope_number),
                "series_number": int(series.series_number),
                "expected_booklets": expected,
                "returned_booklets": returned,
                "status": status_val,
                "verified_at": verified_at,
                "notes": record.notes if record else None,
            }
        )

    rows.sort(
        key=lambda r: (
            str(r["school_name"]).lower(),
            int(r["envelope_number"]),
            int(r["series_number"]),
        )
    )
    return rows


def _counts_from_rows(rows: list[dict]) -> tuple[int, int]:
    pending = sum(1 for r in rows if r["status"] == MarkedScriptReturnStatusSchema.pending.value)
    verified = sum(1 for r in rows if r["status"] == MarkedScriptReturnStatusSchema.verified.value)
    return pending, verified


async def _load_assignment_context(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    examination_id: int,
    subject_id: int,
) -> tuple[AllocationAssignment, Allocation, AllocationRun, Examiner, ScriptEnvelope, ScriptPackingSeries, School]:
    stmt = (
        select(
            AllocationAssignment,
            Allocation,
            AllocationRun,
            Examiner,
            ScriptEnvelope,
            ScriptPackingSeries,
            School,
        )
        .join(AllocationRun, AllocationRun.id == AllocationAssignment.allocation_run_id)
        .join(Allocation, Allocation.id == AllocationRun.allocation_id)
        .join(Examiner, Examiner.id == AllocationAssignment.examiner_id)
        .join(ScriptEnvelope, ScriptEnvelope.id == AllocationAssignment.script_envelope_id)
        .join(ScriptPackingSeries, ScriptPackingSeries.id == ScriptEnvelope.packing_series_id)
        .join(School, School.id == ScriptPackingSeries.school_id)
        .where(AllocationAssignment.id == assignment_id)
    )
    row = (await session.execute(stmt)).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation assignment not found")

    assignment, allocation, run, examiner, _env, _series, _school = row
    if int(allocation.examination_id) != examination_id or int(allocation.subject_id) != subject_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation assignment not found")
    if run.status != AllocationRunStatus.OPTIMAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment is not from an optimal allocation run",
        )

    latest_run_id = await _latest_optimal_run_id(
        session,
        allocation_id=allocation.id,
        examiner_id=examiner.id,
    )
    if latest_run_id != run.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment is not from the examiner's current optimal allocation run",
        )

    return row


async def build_return_filters(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID | None = None,
) -> dict:
    allocations, _subject_code, _subject_name = await _load_subject_allocations(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    existing_by_assignment = await _load_existing_returns_by_assignment(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )

    examiner_options: list[dict] = []
    paper_options: list[dict] = []

    if examiner_id is None:
        examiner_stmt = (
            select(Examiner)
            .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
            .where(
                Examiner.examination_id == examination_id,
                ExaminerSubject.subject_id == subject_id,
            )
            .order_by(Examiner.name)
        )
        examiners = list((await session.execute(examiner_stmt)).scalars().all())
        for examiner in examiners:
            pending_total = 0
            verified_total = 0
            has_envelopes = False
            for allocation in allocations:
                rows = await _envelope_rows_for_examiner_paper(
                    session,
                    allocations=allocations,
                    examiner=examiner,
                    paper_number=int(allocation.paper_number),
                    existing_by_assignment=existing_by_assignment,
                )
                if not rows:
                    continue
                has_envelopes = True
                p, v = _counts_from_rows(rows)
                pending_total += p
                verified_total += v
            if not has_envelopes:
                continue
            examiner_options.append(
                {
                    "examiner_id": examiner.id,
                    "examiner_name": examiner.name,
                    "examiner_type": _examiner_type_label(examiner.examiner_type),
                    "pending_count": pending_total,
                    "verified_count": verified_total,
                }
            )
        examiner_options.sort(
            key=lambda e: (-int(e["pending_count"]), str(e["examiner_name"]).lower()),
        )
    else:
        examiner = await session.get(Examiner, examiner_id)
        if examiner is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")

        paper_counts: dict[int, tuple[int, int]] = defaultdict(lambda: (0, 0))
        for allocation in allocations:
            rows = await _envelope_rows_for_examiner_paper(
                session,
                allocations=allocations,
                examiner=examiner,
                paper_number=int(allocation.paper_number),
                existing_by_assignment=existing_by_assignment,
            )
            if not rows:
                continue
            p, v = _counts_from_rows(rows)
            prev_p, prev_v = paper_counts[int(allocation.paper_number)]
            paper_counts[int(allocation.paper_number)] = (prev_p + p, prev_v + v)

        for paper_num in sorted(paper_counts):
            pending, verified = paper_counts[paper_num]
            paper_options.append(
                {
                    "paper_number": paper_num,
                    "pending_count": pending,
                    "verified_count": verified,
                }
            )

    return {"examiners": examiner_options, "papers": paper_options}


async def build_return_grid(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
    paper_number: int,
) -> dict:
    allocations, subject_code, subject_name = await _load_subject_allocations(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    existing_by_assignment = await _load_existing_returns_by_assignment(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )

    examiner = await session.get(Examiner, examiner_id)
    if examiner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")

    on_subject = (
        await session.execute(
            select(ExaminerSubject.examiner_id).where(
                ExaminerSubject.examiner_id == examiner_id,
                ExaminerSubject.subject_id == subject_id,
            )
        )
    ).scalar_one_or_none()
    if on_subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found for subject")

    rows = await _envelope_rows_for_examiner_paper(
        session,
        allocations=allocations,
        examiner=examiner,
        paper_number=paper_number,
        existing_by_assignment=existing_by_assignment,
    )
    pending, verified = _counts_from_rows(rows)

    marking_group = await get_examiner_marking_group(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )

    result = {
        "subject_id": subject_id,
        "subject_code": subject_code,
        "subject_name": subject_name,
        "examiner_id": examiner.id,
        "examiner_name": examiner.name,
        "examiner_type": _examiner_type_label(examiner.examiner_type),
        "paper_number": paper_number,
        "rows": rows,
        "summary": {"pending": pending, "verified": verified},
    }
    if marking_group:
        result.update(marking_group)
    return result


async def upsert_return(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    assignment_id: UUID,
    returned_booklets: int,
    notes: str | None,
    user: User,
) -> ExaminerMarkedScriptReturn:
    assignment, allocation, run, examiner, _env, _series, _school = await _load_assignment_context(
        session,
        assignment_id=assignment_id,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    expected = int(assignment.booklet_count)

    stmt = select(ExaminerMarkedScriptReturn).where(
        ExaminerMarkedScriptReturn.allocation_assignment_id == assignment_id,
    )
    record = (await session.execute(stmt)).scalar_one_or_none()
    if record is None:
        record = ExaminerMarkedScriptReturn(
            examination_id=examination_id,
            subject_id=subject_id,
            examiner_id=examiner.id,
            paper_number=int(allocation.paper_number),
            allocation_run_id=run.id,
            allocation_assignment_id=assignment_id,
            expected_booklets=expected,
        )
        session.add(record)
    if record.verified_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Return already verified")
    record.expected_booklets = expected
    record.returned_booklets = returned_booklets
    record.notes = notes.strip() if notes else None
    record.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(record)
    return record


async def verify_return(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    assignment_id: UUID,
    notes: str | None,
    allow_mismatch: bool,
    user: User,
) -> ExaminerMarkedScriptReturn:
    assignment, allocation, run, examiner, _env, _series, _school = await _load_assignment_context(
        session,
        assignment_id=assignment_id,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    expected = int(assignment.booklet_count)

    stmt = select(ExaminerMarkedScriptReturn).where(
        ExaminerMarkedScriptReturn.allocation_assignment_id == assignment_id,
    )
    record = (await session.execute(stmt)).scalar_one_or_none()
    if record is None:
        record = ExaminerMarkedScriptReturn(
            examination_id=examination_id,
            subject_id=subject_id,
            examiner_id=examiner.id,
            paper_number=int(allocation.paper_number),
            allocation_run_id=run.id,
            allocation_assignment_id=assignment_id,
            expected_booklets=expected,
        )
        session.add(record)
    if record.verified_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Return already verified")

    record.expected_booklets = expected
    record.returned_booklets = expected
    if notes:
        record.notes = notes.strip()
    record.verified_at = datetime.utcnow()
    record.verified_by_id = user.id
    record.updated_at = datetime.utcnow()
    _ = allow_mismatch
    await session.commit()
    await session.refresh(record)
    return record


async def unverify_return(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    assignment_id: UUID,
    user: User,
) -> ExaminerMarkedScriptReturn:
    _ = user
    await _load_assignment_context(
        session,
        assignment_id=assignment_id,
        examination_id=examination_id,
        subject_id=subject_id,
    )

    stmt = select(ExaminerMarkedScriptReturn).where(
        ExaminerMarkedScriptReturn.allocation_assignment_id == assignment_id,
    )
    record = (await session.execute(stmt)).scalar_one_or_none()
    if record is None or record.verified_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Return is not verified")

    record.verified_at = None
    record.verified_by_id = None
    record.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(record)
    return record
