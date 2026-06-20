"""Preview and cleanup for examiner roster deletion."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Allocation,
    AllocationAssignment,
    AllocationExaminer,
    AllocationRun,
    AllocationRunStatus,
    Examiner,
    ExaminerInvitation,
    ExaminationExaminerManualMarkedScript,
    School,
    ScriptEnvelope,
    ScriptPackingSeries,
    Subject,
)
from app.schemas.examiner_delete import (
    ExaminerAllocationCampaignItem,
    ExaminerDeleteImpactResponse,
    ExaminerEnvelopeAssignmentItem,
    ExaminerManualAllocationItem,
)
from app.services.examiner_invitation import subject_display_code
from app.services.subject_marking_group import sync_subject_cohort_memberships


async def _latest_optimal_run(
    session: AsyncSession,
    allocation_id: UUID,
) -> AllocationRun | None:
    stmt = (
        select(AllocationRun)
        .where(
            AllocationRun.allocation_id == allocation_id,
            AllocationRun.status == AllocationRunStatus.OPTIMAL,
        )
        .order_by(AllocationRun.created_at.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def build_examiner_delete_impact(
    session: AsyncSession,
    examination_id: int,
    examiner: Examiner,
) -> ExaminerDeleteImpactResponse:
    examiner_id = examiner.id

    manual_stmt = (
        select(ExaminationExaminerManualMarkedScript, Subject)
        .join(Subject, ExaminationExaminerManualMarkedScript.subject_id == Subject.id)
        .where(
            ExaminationExaminerManualMarkedScript.examination_id == examination_id,
            ExaminationExaminerManualMarkedScript.examiner_id == examiner_id,
            ExaminationExaminerManualMarkedScript.script_count > 0,
        )
        .order_by(Subject.code, ExaminationExaminerManualMarkedScript.paper_number)
    )
    manual_rows = (await session.execute(manual_stmt)).all()
    manual_allocations = [
        ExaminerManualAllocationItem(
            subject_code=subject_display_code(subject),
            subject_name=(subject.name or "").strip(),
            paper_number=int(row.paper_number),
            script_count=int(row.script_count),
        )
        for row, subject in manual_rows
    ]
    total_manual_scripts = sum(item.script_count for item in manual_allocations)

    alloc_stmt = select(Allocation).where(Allocation.examination_id == examination_id)
    allocations = list((await session.execute(alloc_stmt)).scalars().all())
    subject_by_id: dict[int, Subject] = {}
    if allocations:
        subject_ids = {int(a.subject_id) for a in allocations}
        subj_stmt = select(Subject).where(Subject.id.in_(subject_ids))
        subject_by_id = {int(s.id): s for s in (await session.execute(subj_stmt)).scalars().all()}

    envelope_assignments: list[ExaminerEnvelopeAssignmentItem] = []
    campaigns_with_envelopes: set[UUID] = set()

    for allocation in allocations:
        run = await _latest_optimal_run(session, allocation.id)
        if run is None:
            continue
        subject = subject_by_id.get(int(allocation.subject_id))
        subject_code = subject_display_code(subject) if subject else str(allocation.subject_id)
        subject_name = (subject.name or "").strip() if subject else ""

        assign_stmt = (
            select(AllocationAssignment, ScriptEnvelope, ScriptPackingSeries, School)
            .join(ScriptEnvelope, AllocationAssignment.script_envelope_id == ScriptEnvelope.id)
            .join(ScriptPackingSeries, ScriptEnvelope.packing_series_id == ScriptPackingSeries.id)
            .join(School, ScriptPackingSeries.school_id == School.id)
            .where(
                AllocationAssignment.allocation_run_id == run.id,
                AllocationAssignment.examiner_id == examiner_id,
            )
            .order_by(School.name, ScriptEnvelope.envelope_number)
        )
        for assignment, envelope, _series, school in (await session.execute(assign_stmt)).all():
            campaigns_with_envelopes.add(allocation.id)
            envelope_assignments.append(
                ExaminerEnvelopeAssignmentItem(
                    allocation_id=allocation.id,
                    allocation_name=allocation.name,
                    subject_code=subject_code,
                    subject_name=subject_name,
                    paper_number=int(allocation.paper_number),
                    school_name=(school.name or "").strip(),
                    envelope_number=int(envelope.envelope_number),
                    booklet_count=int(assignment.booklet_count),
                    run_id=run.id,
                )
            )

    member_stmt = (
        select(AllocationExaminer, Allocation)
        .join(Allocation, AllocationExaminer.allocation_id == Allocation.id)
        .where(
            AllocationExaminer.examiner_id == examiner_id,
            Allocation.examination_id == examination_id,
        )
        .order_by(Allocation.name)
    )
    allocation_campaigns: list[ExaminerAllocationCampaignItem] = []
    for _member, allocation in (await session.execute(member_stmt)).all():
        if allocation.id in campaigns_with_envelopes:
            continue
        subject = subject_by_id.get(int(allocation.subject_id))
        allocation_campaigns.append(
            ExaminerAllocationCampaignItem(
                allocation_id=allocation.id,
                allocation_name=allocation.name,
                subject_code=subject_display_code(subject) if subject else str(allocation.subject_id),
                subject_name=(subject.name or "").strip() if subject else "",
                paper_number=int(allocation.paper_number),
            )
        )

    requires_confirmation = bool(manual_allocations or envelope_assignments or allocation_campaigns)

    return ExaminerDeleteImpactResponse(
        examiner_id=examiner_id,
        examiner_name=examiner.name,
        manual_allocations=manual_allocations,
        envelope_assignments=envelope_assignments,
        allocation_campaigns=allocation_campaigns,
        total_manual_scripts=total_manual_scripts,
        total_envelopes=len(envelope_assignments),
        requires_confirmation=requires_confirmation,
    )


async def delete_examiner_with_cleanup(
    session: AsyncSession,
    examination_id: int,
    examiner: Examiner,
) -> None:
    examiner_id = examiner.id
    subject_ids_before = [int(s.subject_id) for s in examiner.subjects]

    linked_invitation = (
        await session.execute(
            select(ExaminerInvitation).where(ExaminerInvitation.examiner_id == examiner_id)
        )
    ).scalar_one_or_none()

    await session.execute(
        delete(AllocationAssignment).where(AllocationAssignment.examiner_id == examiner_id)
    )
    await session.execute(
        delete(AllocationExaminer).where(AllocationExaminer.examiner_id == examiner_id)
    )
    await session.execute(
        delete(ExaminationExaminerManualMarkedScript).where(
            ExaminationExaminerManualMarkedScript.examination_id == examination_id,
            ExaminationExaminerManualMarkedScript.examiner_id == examiner_id,
        )
    )

    await session.delete(examiner)
    await session.flush()

    if linked_invitation is not None:
        await session.delete(linked_invitation)
        await session.flush()

    for sid in subject_ids_before:
        await sync_subject_cohort_memberships(
            session,
            examination_id=examination_id,
            subject_id=sid,
        )


async def load_examiner_for_delete(
    session: AsyncSession,
    examination_id: int,
    examiner_id: UUID,
) -> Examiner | None:
    stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id, Examiner.examination_id == examination_id)
        .options(selectinload(Examiner.subjects))
    )
    return (await session.execute(stmt)).scalar_one_or_none()
