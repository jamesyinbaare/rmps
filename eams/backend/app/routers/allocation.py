"""Allocation execution endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import AllocationStatus, ExaminerAllocation
from app.schemas.allocation import AllocationResult, ExaminerAllocationResponse
from app.services.allocation_service import promote_from_waitlist, run_allocation
from app.services.notification_service import notify_approved_examiners
from app.services.quota_validator import validate_quota_compliance

router = APIRouter(prefix="/api/v1/admin/allocations", tags=["admin-allocations"])


@router.post("/cycles/{cycle_id}/subjects/{subject_id}/allocate", response_model=AllocationResult)
async def execute_allocation(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> AllocationResult:
    """Run allocation for a marking cycle and subject."""
    try:
        result = await run_allocation(session, cycle_id, subject_id, current_user.id)
        return AllocationResult(**result)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/cycles/{cycle_id}/subjects/{subject_id}/promote-waitlist", response_model=dict)
async def promote_waitlist(
    cycle_id: UUID,
    subject_id: UUID,
    slot_count: int,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Promote examiners from waitlist."""
    try:
        result = await promote_from_waitlist(session, cycle_id, subject_id, slot_count, current_user.id)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/cycles/{cycle_id}/subjects/{subject_id}", response_model=list[ExaminerAllocationResponse])
async def list_allocations(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
    status_filter: AllocationStatus | None = None,
) -> list[ExaminerAllocationResponse]:
    """List allocations for a cycle and subject."""
    stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.cycle_id == cycle_id,
        ExaminerAllocation.subject_id == subject_id,
    )

    if status_filter:
        stmt = stmt.where(ExaminerAllocation.allocation_status == status_filter)

    stmt = stmt.order_by(ExaminerAllocation.rank)
    result = await session.execute(stmt)
    allocations = result.scalars().all()

    return [ExaminerAllocationResponse.model_validate(alloc) for alloc in allocations]


@router.get("/cycles/{cycle_id}/subjects/{subject_id}/quota-compliance", response_model=dict)
async def check_quota_compliance(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Check quota compliance for current allocations."""
    # Get all approved allocations
    stmt = select(ExaminerAllocation).where(
        ExaminerAllocation.cycle_id == cycle_id,
        ExaminerAllocation.subject_id == subject_id,
        ExaminerAllocation.allocation_status == AllocationStatus.APPROVED,
    )
    result = await session.execute(stmt)
    allocations = result.scalars().all()

    examiner_ids = [alloc.examiner_id for alloc in allocations]
    is_valid, violations = await validate_quota_compliance(session, cycle_id, subject_id, examiner_ids)

    return {
        "compliant": is_valid,
        "violations": violations,
        "approved_count": len(examiner_ids),
    }


@router.post("/cycles/{cycle_id}/subjects/{subject_id}/notify", response_model=dict)
async def notify_approved(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Notify approved examiners."""
    try:
        result = await notify_approved_examiners(session, cycle_id, subject_id)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
