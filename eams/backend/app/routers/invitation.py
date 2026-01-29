"""Invitation execution endpoints (run invitation, list, promote waitlist, notify)."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import AcceptanceStatus, AllocationStatus, Examiner, ExaminerAcceptance, ExaminerAllocation
from app.schemas.invitation import AdminAcceptanceListResponse, AllocationResult, ExaminerAllocationResponse, InvitationWithExaminerResponse
from app.services.invitation_service import promote_from_waitlist, run_allocation
from app.services.notification_service import notify_approved_examiners
from app.services.quota_validator import validate_quota_compliance

router = APIRouter(prefix="/api/v1/admin/invitations", tags=["admin-invitations"])


@router.post("/subject-examiners/{subject_examiner_id}/run", response_model=AllocationResult)
async def run_invitation(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> AllocationResult:
    """Run invitation for a subject examiner (replaces existing invitations if any)."""
    try:
        result = await run_allocation(session, subject_examiner_id, current_user.id)
        return AllocationResult(**result)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/subject-examiners/{subject_examiner_id}/promote-waitlist", response_model=dict)
async def promote_waitlist(
    subject_examiner_id: UUID,
    slot_count: int,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Promote examiners from waitlist."""
    try:
        result = await promote_from_waitlist(session, subject_examiner_id, slot_count, current_user.id)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/subject-examiners/{subject_examiner_id}", response_model=list[InvitationWithExaminerResponse])
async def list_invitations(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
    status_filter: AllocationStatus | None = None,
) -> list[InvitationWithExaminerResponse]:
    """List invitations for a subject examiner with examiner name and region."""
    stmt = (
        select(
            ExaminerAllocation,
            Examiner.full_name.label("examiner_full_name"),
            Examiner.region.label("examiner_region"),
        )
        .join(Examiner, ExaminerAllocation.examiner_id == Examiner.id)
        .where(ExaminerAllocation.subject_examiner_id == subject_examiner_id)
    )

    if status_filter:
        stmt = stmt.where(ExaminerAllocation.allocation_status == status_filter)

    stmt = stmt.order_by(ExaminerAllocation.rank)
    result = await session.execute(stmt)
    rows = result.all()

    return [
        InvitationWithExaminerResponse(
            id=alloc.id,
            examiner_id=alloc.examiner_id,
            examiner_full_name=examiner_full_name,
            examiner_region=examiner_region,
            subject_examiner_id=alloc.subject_examiner_id,
            subject_id=alloc.subject_id,
            score=alloc.score,
            rank=alloc.rank,
            allocation_status=alloc.allocation_status,
            allocated_at=alloc.allocated_at,
        )
        for alloc, examiner_full_name, examiner_region in rows
    ]


@router.get("/subject-examiners/{subject_examiner_id}/acceptances", response_model=list[AdminAcceptanceListResponse])
async def list_acceptances(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
    status_filter: AcceptanceStatus | None = None,
) -> list[AdminAcceptanceListResponse]:
    """List acceptances for a subject examiner (examiners who accepted/declined/pending)."""
    stmt = (
        select(
            ExaminerAcceptance,
            Examiner.full_name.label("examiner_full_name"),
            Examiner.region.label("examiner_region"),
        )
        .join(Examiner, ExaminerAcceptance.examiner_id == Examiner.id)
        .where(ExaminerAcceptance.subject_examiner_id == subject_examiner_id)
    )
    if status_filter is not None:
        stmt = stmt.where(ExaminerAcceptance.status == status_filter)
    stmt = stmt.order_by(ExaminerAcceptance.responded_at.desc().nulls_last())
    result = await session.execute(stmt)
    rows = result.all()
    return [
        AdminAcceptanceListResponse(
            id=acc.id,
            examiner_id=acc.examiner_id,
            examiner_full_name=examiner_full_name,
            examiner_region=examiner_region,
            status=acc.status,
            notified_at=acc.notified_at,
            responded_at=acc.responded_at,
            response_deadline=acc.response_deadline,
        )
        for acc, examiner_full_name, examiner_region in rows
    ]


@router.get("/subject-examiners/{subject_examiner_id}/quota-compliance", response_model=dict)
async def check_quota_compliance(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Check quota compliance for current invitations."""
    stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.subject_examiner_id == subject_examiner_id,
        ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
    )
    result = await session.execute(stmt)
    allocations = result.scalars().all()

    examiner_ids = [alloc.examiner_id for alloc in allocations]
    subject_id = allocations[0].subject_id if allocations else None
    if subject_id is None:
        from app.models import SubjectExaminer
        se_stmt = select(SubjectExaminer).where(SubjectExaminer.id == subject_examiner_id)
        se_result = await session.execute(se_stmt)
        se = se_result.scalar_one_or_none()
        subject_id = se.subject_id if se else None
    if subject_id is None:
        return {"compliant": True, "violations": [], "approved_count": 0, "examiners_without_region": 0, "hint": None}

    is_valid, violations = await validate_quota_compliance(session, subject_examiner_id, subject_id, examiner_ids)

    examiners_without_region = 0
    hint = None
    if examiner_ids:
        examiner_stmt = select(Examiner).where(Examiner.id.in_(examiner_ids))
        examiner_result = await session.execute(examiner_stmt)
        examiners_list = examiner_result.scalars().all()
        examiners_without_region = sum(1 for ex in examiners_list if ex.region is None or (isinstance(ex.region, str) and ex.region.strip() == ""))
        if examiners_without_region and violations:
            hint = (
                f"{examiners_without_region} invited examiner(s) have no region set, so region quotas count them as 0. "
                "Region is set when you accept an application; for already-accepted applications use "
                "POST /api/v1/admin/applications/{application_id}/sync-eligibility to backfill."
            )

    return {
        "compliant": is_valid,
        "violations": violations,
        "approved_count": len(examiner_ids),
        "examiners_without_region": examiners_without_region,
        "hint": hint,
    }


@router.post("/subject-examiners/{subject_examiner_id}/notify", response_model=dict)
async def notify_approved(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Notify approved examiners."""
    try:
        result = await notify_approved_examiners(session, subject_examiner_id)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
