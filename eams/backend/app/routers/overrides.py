"""Admin override endpoints for invitation management."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import AllocationAuditLog, AllocationStatus, ExaminerAllocation
from app.schemas.invitation import ExaminerAllocationResponse

router = APIRouter(prefix="/api/v1/admin/invitations", tags=["admin-overrides"])


@router.post("/{allocation_id}/force-approve", response_model=ExaminerAllocationResponse)
async def force_approve_allocation(
    allocation_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerAllocationResponse:
    """Force approve an allocation (admin override)."""
    stmt = select(ExaminerAllocation).where(ExaminerAllocation.id == allocation_id)
    result = await session.execute(stmt)
    allocation = result.scalar_one_or_none()

    if not allocation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )

    old_status = allocation.allocation_status
    allocation.allocation_status = AllocationStatus.APPROVED

    # Log action
    audit_log = AllocationAuditLog(
        action_type="FORCE_APPROVE",
        performed_by_user_id=current_user.id,
        subject_examiner_id=allocation.subject_examiner_id,
        subject_id=allocation.subject_id,
        examiner_id=allocation.examiner_id,
        allocation_id=allocation.id,
        details={"previous_status": old_status.value, "new_status": "APPROVED", "reason": "Admin override"},
    )
    session.add(audit_log)

    await session.commit()
    await session.refresh(allocation)

    return ExaminerAllocationResponse.model_validate(allocation)


@router.post("/{allocation_id}/force-decline", response_model=ExaminerAllocationResponse)
async def force_decline_allocation(
    allocation_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerAllocationResponse:
    """Force decline an allocation (admin override)."""
    stmt = select(ExaminerAllocation).where(ExaminerAllocation.id == allocation_id)
    result = await session.execute(stmt)
    allocation = result.scalar_one_or_none()

    if not allocation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )

    old_status = allocation.allocation_status
    allocation.allocation_status = AllocationStatus.WAITLISTED

    # Log action
    audit_log = AllocationAuditLog(
        action_type="FORCE_DECLINE",
        performed_by_user_id=current_user.id,
        subject_examiner_id=allocation.subject_examiner_id,
        subject_id=allocation.subject_id,
        examiner_id=allocation.examiner_id,
        allocation_id=allocation.id,
        details={"previous_status": old_status.value, "new_status": "WAITLISTED", "reason": "Admin override"},
    )
    session.add(audit_log)

    await session.commit()
    await session.refresh(allocation)

    return ExaminerAllocationResponse.model_validate(allocation)


@router.post("/{allocation_id}/promote", response_model=ExaminerAllocationResponse)
async def promote_allocation(
    allocation_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerAllocationResponse:
    """Promote an allocation from waitlist to approved (admin override)."""
    stmt = select(ExaminerAllocation).where(ExaminerAllocation.id == allocation_id)
    result = await session.execute(stmt)
    allocation = result.scalar_one_or_none()

    if not allocation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )

    if allocation.allocation_status != AllocationStatus.WAITLISTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Allocation is not waitlisted",
        )

    allocation.allocation_status = AllocationStatus.APPROVED

    # Log action
    audit_log = AllocationAuditLog(
        action_type="PROMOTE",
        performed_by_user_id=current_user.id,
        subject_examiner_id=allocation.subject_examiner_id,
        subject_id=allocation.subject_id,
        examiner_id=allocation.examiner_id,
        allocation_id=allocation.id,
        details={"previous_status": "WAITLISTED", "new_status": "APPROVED", "reason": "Admin promotion"},
    )
    session.add(audit_log)

    await session.commit()
    await session.refresh(allocation)

    return ExaminerAllocationResponse.model_validate(allocation)


@router.post("/{allocation_id}/demote", response_model=ExaminerAllocationResponse)
async def demote_allocation(
    allocation_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminerAllocationResponse:
    """Demote an allocation from approved to waitlist (admin override)."""
    stmt = select(ExaminerAllocation).where(ExaminerAllocation.id == allocation_id)
    result = await session.execute(stmt)
    allocation = result.scalar_one_or_none()

    if not allocation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )

    if allocation.allocation_status != AllocationStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Allocation is not approved",
        )

    allocation.allocation_status = AllocationStatus.WAITLISTED

    # Log action
    audit_log = AllocationAuditLog(
        action_type="DEMOTE",
        performed_by_user_id=current_user.id,
        subject_examiner_id=allocation.subject_examiner_id,
        subject_id=allocation.subject_id,
        examiner_id=allocation.examiner_id,
        allocation_id=allocation.id,
        details={"previous_status": "APPROVED", "new_status": "WAITLISTED", "reason": "Admin demotion"},
    )
    session.add(audit_log)

    await session.commit()
    await session.refresh(allocation)

    return ExaminerAllocationResponse.model_validate(allocation)
