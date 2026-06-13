"""Sum allocated booklet counts per examiner, subject, and paper from optimal allocation runs."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationRun,
    AllocationRunStatus,
    ExaminationExaminerManualMarkedScript,
    ExaminationSubjectMarkingScriptSource,
    MarkingScriptSourceMode,
)

AllocatedBookletsMap = dict[tuple[UUID, int, int], int]


def _marking_source_mode_value(mode: MarkingScriptSourceMode | str | None) -> str:
    if mode is None:
        return MarkingScriptSourceMode.ALLOCATION.value
    if isinstance(mode, MarkingScriptSourceMode):
        return mode.value
    return str(mode).strip().lower()


def _is_manual_marking_source_mode(mode: MarkingScriptSourceMode | str | None) -> bool:
    return _marking_source_mode_value(mode) == MarkingScriptSourceMode.MANUAL.value


async def load_allocated_booklets_map(
    session: AsyncSession,
    examination_id: int,
) -> AllocatedBookletsMap:
    """Aggregate booklet counts from the latest optimal run per allocation campaign."""
    alloc_stmt = select(Allocation).where(Allocation.examination_id == examination_id)
    allocations = list((await session.execute(alloc_stmt)).scalars().all())

    out: AllocatedBookletsMap = {}
    for allocation in allocations:
        subject_id = int(allocation.subject_id)
        paper_number = int(allocation.paper_number)
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

        assign_stmt = select(AllocationAssignment).where(AllocationAssignment.allocation_run_id == run.id)
        for assignment in (await session.execute(assign_stmt)).scalars().all():
            key = (assignment.examiner_id, subject_id, paper_number)
            out[key] = out.get(key, 0) + int(assignment.booklet_count)
    return out


async def load_subject_source_modes(
    session: AsyncSession,
    examination_id: int,
) -> dict[int, MarkingScriptSourceMode]:
    stmt = select(ExaminationSubjectMarkingScriptSource).where(
        ExaminationSubjectMarkingScriptSource.examination_id == examination_id,
    )
    rows = (await session.execute(stmt)).scalars().all()
    return {int(r.subject_id): r.source_mode for r in rows}


async def load_manual_marked_scripts_map(
    session: AsyncSession,
    examination_id: int,
) -> AllocatedBookletsMap:
    stmt = select(ExaminationExaminerManualMarkedScript).where(
        ExaminationExaminerManualMarkedScript.examination_id == examination_id,
        ExaminationExaminerManualMarkedScript.script_count > 0,
    )
    rows = (await session.execute(stmt)).scalars().all()
    return {
        (r.examiner_id, int(r.subject_id), int(r.paper_number)): int(r.script_count)
        for r in rows
    }


async def load_effective_allocated_booklets_map(
    session: AsyncSession,
    examination_id: int,
) -> AllocatedBookletsMap:
    """Allocation counts with manual overrides per subject in manual source mode."""
    allocation_map = await load_allocated_booklets_map(session, examination_id)
    source_modes = await load_subject_source_modes(session, examination_id)
    manual_map = await load_manual_marked_scripts_map(session, examination_id)

    manual_subject_ids = {
        subject_id for subject_id, mode in source_modes.items() if _is_manual_marking_source_mode(mode)
    }
    if not manual_subject_ids:
        return allocation_map

    out: AllocatedBookletsMap = {
        key: count
        for key, count in allocation_map.items()
        if key[1] not in manual_subject_ids
    }
    for key, count in manual_map.items():
        _examiner_id, subject_id, _paper = key
        if subject_id in manual_subject_ids:
            out[key] = count
    return out
