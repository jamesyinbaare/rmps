"""Public examiner profile: scripts allocation summary for accepted invitations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationExaminer,
    AllocationRun,
    AllocationRunStatus,
    ExaminerInvitation,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
)
from app.services.examiner_bank_account import require_accepted_invitation_for_bank


def require_accepted_invitation_for_profile(inv: ExaminerInvitation) -> UUID:
    """Return examiner_id when invitation is accepted (same guard as bank routes)."""
    return require_accepted_invitation_for_bank(inv)


async def get_examiner_scripts_allocation(
    session: AsyncSession,
    *,
    examiner_id: UUID,
    examination_id: int,
    subject_id: int,
) -> dict:
    """
    Read-only scripts allocation summary from latest OPTIMAL runs per paper campaign.

    Returns {"blocks": [...]}; empty list when no published allocations yet.
    """
    alloc_stmt = (
        select(Allocation)
        .join(AllocationExaminer, AllocationExaminer.allocation_id == Allocation.id)
        .where(
            Allocation.examination_id == examination_id,
            Allocation.subject_id == subject_id,
            AllocationExaminer.examiner_id == examiner_id,
        )
        .options(selectinload(Allocation.subject))
        .order_by(Allocation.paper_number)
    )
    allocations = list((await session.execute(alloc_stmt)).scalars().all())

    blocks: list[dict] = []
    for allocation in allocations:
        subj = allocation.subject
        subject_code = subj.code if subj else ""
        subject_name = subj.name if subj else ""

        run_stmt = (
            select(AllocationRun)
            .where(
                AllocationRun.allocation_id == allocation.id,
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
            continue

        assign_stmt = (
            select(
                AllocationAssignment,
                ScriptEnvelope,
                ScriptPackingSeries,
                School,
            )
            .join(ScriptEnvelope, AllocationAssignment.script_envelope_id == ScriptEnvelope.id)
            .join(ScriptPackingSeries, ScriptEnvelope.packing_series_id == ScriptPackingSeries.id)
            .join(School, ScriptPackingSeries.school_id == School.id)
            .where(
                AllocationAssignment.allocation_run_id == run.id,
                AllocationAssignment.examiner_id == examiner_id,
            )
        )
        result = await session.execute(assign_stmt)

        by_school: dict[tuple[str, str], int] = {}
        for aa, _env, _series, school in result.all():
            key = (school.code, school.name)
            by_school[key] = by_school.get(key, 0) + int(aa.booklet_count)

        if not by_school:
            continue

        rows = [
            {
                "school_code": code,
                "school_name": name,
                "booklet_count": count,
            }
            for (code, name), count in sorted(by_school.items(), key=lambda x: x[0][1].lower())
        ]
        total = sum(r["booklet_count"] for r in rows)
        blocks.append(
            {
                "subject_code": subject_code,
                "subject_name": subject_name,
                "paper_number": int(allocation.paper_number),
                "rows": rows,
                "total_booklets": total,
            }
        )

    return {"blocks": blocks}


async def get_scripts_allocation_for_invitation(
    session: AsyncSession,
    inv: ExaminerInvitation,
) -> dict:
    examiner_id = require_accepted_invitation_for_profile(inv)
    return await get_examiner_scripts_allocation(
        session,
        examiner_id=examiner_id,
        examination_id=int(inv.examination_id),
        subject_id=int(inv.subject_id),
    )
