"""Marking-centre marked script return verification."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
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
    User,
)
from app.schemas.subject_officer import MarkedScriptReturnStatusSchema


def _examiner_type_label(examiner_type: ExaminerType) -> str:
    return {
        ExaminerType.CHIEF: "Chief examiner",
        ExaminerType.ASSISTANT: "Assistant examiner",
        ExaminerType.TEAM_LEADER: "Team leader",
    }[examiner_type]


def _row_status(expected: int, returned: int | None, verified_at: datetime | None) -> str:
    if verified_at is not None:
        return MarkedScriptReturnStatusSchema.verified.value
    if returned is None:
        return MarkedScriptReturnStatusSchema.pending.value
    if returned < expected:
        return MarkedScriptReturnStatusSchema.partial.value
    return MarkedScriptReturnStatusSchema.complete.value


async def _expected_booklets_for_examiner_paper(
    session: AsyncSession,
    *,
    allocation_id: UUID,
    examiner_id: UUID,
) -> tuple[UUID | None, int]:
    run_stmt = (
        select(AllocationRun)
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
    run = (await session.execute(run_stmt)).scalar_one_or_none()
    if run is None:
        return None, 0
    total = await session.scalar(
        select(func.coalesce(func.sum(AllocationAssignment.booklet_count), 0)).where(
            AllocationAssignment.allocation_run_id == run.id,
            AllocationAssignment.examiner_id == examiner_id,
        )
    )
    return run.id, int(total or 0)


async def build_return_grid(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> dict:
    from app.models import Subject

    alloc_with_subject = (
        select(Allocation)
        .where(Allocation.examination_id == examination_id, Allocation.subject_id == subject_id)
        .options(selectinload(Allocation.subject))
        .order_by(Allocation.paper_number)
    )
    allocations = list((await session.execute(alloc_with_subject)).scalars().all())
    subject = allocations[0].subject if allocations else await session.get(Subject, subject_id)
    subject_code = subject.code if subject else ""
    subject_name = subject.name if subject else ""

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

    existing_stmt = select(ExaminerMarkedScriptReturn).where(
        ExaminerMarkedScriptReturn.examination_id == examination_id,
        ExaminerMarkedScriptReturn.subject_id == subject_id,
    )
    existing_rows = list((await session.execute(existing_stmt)).scalars().all())
    existing_by_key = {
        (r.examiner_id, r.paper_number, r.allocation_run_id): r for r in existing_rows
    }

    rows: list[dict] = []
    summary = {"pending": 0, "partial": 0, "complete": 0, "verified": 0}

    for examiner in examiners:
        for allocation in allocations:
            run_id, expected = await _expected_booklets_for_examiner_paper(
                session,
                allocation_id=allocation.id,
                examiner_id=examiner.id,
            )
            if run_id is None or expected <= 0:
                continue
            key = (examiner.id, int(allocation.paper_number), run_id)
            record = existing_by_key.get(key)
            returned = record.returned_booklets if record else None
            verified_at = record.verified_at if record else None
            status_val = _row_status(expected, returned, verified_at)
            summary[status_val] = summary.get(status_val, 0) + 1
            rows.append(
                {
                    "examiner_id": examiner.id,
                    "examiner_name": examiner.name,
                    "examiner_type": _examiner_type_label(examiner.examiner_type),
                    "paper_number": int(allocation.paper_number),
                    "allocation_run_id": run_id,
                    "expected_booklets": expected,
                    "returned_booklets": returned,
                    "status": status_val,
                    "verified_at": verified_at,
                    "notes": record.notes if record else None,
                }
            )

    return {
        "subject_id": subject_id,
        "subject_code": subject_code,
        "subject_name": subject_name,
        "rows": rows,
        "summary": summary,
    }


async def upsert_return(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id: UUID,
    paper_number: int,
    returned_booklets: int,
    notes: str | None,
    user: User,
) -> ExaminerMarkedScriptReturn:
    allocation_stmt = select(Allocation).where(
        Allocation.examination_id == examination_id,
        Allocation.subject_id == subject_id,
        Allocation.paper_number == paper_number,
    )
    allocation = (await session.execute(allocation_stmt)).scalar_one_or_none()
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No allocation for this paper")

    run_id, expected = await _expected_booklets_for_examiner_paper(
        session,
        allocation_id=allocation.id,
        examiner_id=examiner_id,
    )
    if run_id is None or expected <= 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No optimal allocation assignment for this examiner and paper",
        )

    stmt = select(ExaminerMarkedScriptReturn).where(
        ExaminerMarkedScriptReturn.examination_id == examination_id,
        ExaminerMarkedScriptReturn.subject_id == subject_id,
        ExaminerMarkedScriptReturn.examiner_id == examiner_id,
        ExaminerMarkedScriptReturn.paper_number == paper_number,
        ExaminerMarkedScriptReturn.allocation_run_id == run_id,
    )
    record = (await session.execute(stmt)).scalar_one_or_none()
    if record is None:
        record = ExaminerMarkedScriptReturn(
            examination_id=examination_id,
            subject_id=subject_id,
            examiner_id=examiner_id,
            paper_number=paper_number,
            allocation_run_id=run_id,
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
    examiner_id: UUID,
    paper_number: int,
    notes: str | None,
    allow_mismatch: bool,
    user: User,
) -> ExaminerMarkedScriptReturn:
    allocation_stmt = select(Allocation).where(
        Allocation.examination_id == examination_id,
        Allocation.subject_id == subject_id,
        Allocation.paper_number == paper_number,
    )
    allocation = (await session.execute(allocation_stmt)).scalar_one_or_none()
    if allocation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No allocation for this paper")

    run_id, expected = await _expected_booklets_for_examiner_paper(
        session,
        allocation_id=allocation.id,
        examiner_id=examiner_id,
    )
    if run_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No optimal allocation assignment for this examiner and paper",
        )

    stmt = select(ExaminerMarkedScriptReturn).where(
        ExaminerMarkedScriptReturn.examination_id == examination_id,
        ExaminerMarkedScriptReturn.subject_id == subject_id,
        ExaminerMarkedScriptReturn.examiner_id == examiner_id,
        ExaminerMarkedScriptReturn.paper_number == paper_number,
        ExaminerMarkedScriptReturn.allocation_run_id == run_id,
    )
    record = (await session.execute(stmt)).scalar_one_or_none()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Record returned count before verifying",
        )
    if record.verified_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Return already verified")
    if record.returned_booklets is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Returned count is required")
    if record.returned_booklets != record.expected_booklets and not allow_mismatch:
        if not notes and not record.notes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Notes are required when returned count does not match expected",
            )
    if notes:
        record.notes = notes.strip()
    record.verified_at = datetime.utcnow()
    record.verified_by_id = user.id
    record.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(record)
    return record
