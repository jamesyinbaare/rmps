"""Examiner acceptance endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, ExaminerAcceptance, ExaminerAllocation
from app.schemas.allocation import ExaminerAcceptanceResponse
from app.services.acceptance_service import accept_allocation, decline_allocation

router = APIRouter(prefix="/api/v1/examiner", tags=["examiner"])


@router.post("/acceptances/{acceptance_id}/accept", response_model=ExaminerAcceptanceResponse)
async def accept_allocation_endpoint(
    acceptance_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerAcceptanceResponse:
    """Examiner accepts an allocation."""
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    # Verify acceptance belongs to current user's examiner
    stmt = select(ExaminerAcceptance).where(
        ExaminerAcceptance.id == acceptance_id,
        ExaminerAcceptance.examiner_id == examiner.id,
    )
    result = await session.execute(stmt)
    acceptance = result.scalar_one_or_none()

    if not acceptance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acceptance not found or does not belong to you",
        )

    try:
        updated = await accept_allocation(session, acceptance_id)
        return ExaminerAcceptanceResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/acceptances/{acceptance_id}/decline", response_model=ExaminerAcceptanceResponse)
async def decline_allocation_endpoint(
    acceptance_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerAcceptanceResponse:
    """Examiner declines an allocation."""
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    # Verify acceptance belongs to current user's examiner
    stmt = select(ExaminerAcceptance).where(
        ExaminerAcceptance.id == acceptance_id,
        ExaminerAcceptance.examiner_id == examiner.id,
    )
    result = await session.execute(stmt)
    acceptance = result.scalar_one_or_none()

    if not acceptance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acceptance not found or does not belong to you",
        )

    try:
        updated = await decline_allocation(session, acceptance_id)
        return ExaminerAcceptanceResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/allocations", response_model=list[ExaminerAcceptanceResponse])
async def list_examiner_allocations(
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> list[ExaminerAcceptanceResponse]:
    """List examiner's allocations and acceptances."""
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        return []

    stmt = select(ExaminerAcceptance).where(ExaminerAcceptance.examiner_id == examiner.id)
    result = await session.execute(stmt)
    acceptances = result.scalars().all()

    return [ExaminerAcceptanceResponse.model_validate(acc) for acc in acceptances]


@router.get("/allocations/{allocation_id}", response_model=ExaminerAcceptanceResponse)
async def get_allocation_details(
    allocation_id: UUID,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> ExaminerAcceptanceResponse:
    """Get allocation details."""
    examiner_stmt = select(Examiner).where(Examiner.user_id == current_user.id)
    examiner_result = await session.execute(examiner_stmt)
    examiner = examiner_result.scalar_one_or_none()

    if not examiner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examiner profile not found",
        )

    # Get acceptance for this allocation
    stmt = select(ExaminerAcceptance).where(
        ExaminerAcceptance.allocation_id == allocation_id,
        ExaminerAcceptance.examiner_id == examiner.id,
    )
    result = await session.execute(stmt)
    acceptance = result.scalar_one_or_none()

    if not acceptance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )

    return ExaminerAcceptanceResponse.model_validate(acceptance)
