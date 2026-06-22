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
from app.services.scripts_allocation_release import (
    is_scripts_allocation_visible_for_examiner,
)


def require_accepted_invitation_for_profile(inv: ExaminerInvitation) -> UUID:
    """Return examiner_id when invitation is accepted (same guard as bank routes)."""
    return require_accepted_invitation_for_bank(inv)


async def get_examiner_scripts_allocation(
    session: AsyncSession,
    *,
    examiner_id: UUID,
    examination_id: int,
    subject_id: int,
    apply_release_gate: bool = True,
) -> dict:
    """
    Read-only scripts allocation summary from latest OPTIMAL runs per paper campaign.

    Returns {"blocks": [...]}; empty list when no published allocations yet.
    When apply_release_gate is True (public portal), returns empty blocks until
    at least one of the examiner's cohort memberships has passed release.
    """
    if apply_release_gate:
        visible = await is_scripts_allocation_visible_for_examiner(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            examiner_id=examiner_id,
        )
        if not visible:
            return {"blocks": []}
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

        rows: list[dict] = []
        for aa, env, series, school in result.all():
            rows.append(
                {
                    "school_code": school.code,
                    "school_name": school.name,
                    "envelope_number": int(env.envelope_number),
                    "series_number": int(series.series_number),
                    "booklet_count": int(aa.booklet_count),
                }
            )

        if not rows:
            continue

        rows.sort(
            key=lambda r: (
                str(r["school_name"]).lower(),
                int(r["envelope_number"]),
                int(r["series_number"]),
            )
        )
        total = sum(int(r["booklet_count"]) for r in rows)
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
        apply_release_gate=True,
    )
