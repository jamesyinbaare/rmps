"""Marking cycle management endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import MarkingCycle, MarkingCycleStatus
from app.schemas.allocation import AllocationResult, MarkingCycleCreate, MarkingCycleResponse, MarkingCycleUpdate

router = APIRouter(prefix="/api/v1/admin/cycles", tags=["admin-cycles"])


@router.post("", response_model=MarkingCycleResponse, status_code=status.HTTP_201_CREATED)
async def create_marking_cycle(
    cycle_data: MarkingCycleCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> MarkingCycleResponse:
    """Create a new marking cycle."""
    # Check if cycle already exists for this year/subject
    existing_stmt = select(MarkingCycle).where(
        MarkingCycle.year == cycle_data.year,
        MarkingCycle.subject_id == cycle_data.subject_id,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Marking cycle already exists for this year and subject",
        )

    cycle = MarkingCycle(
        year=cycle_data.year,
        subject_id=cycle_data.subject_id,
        total_required=cycle_data.total_required,
        experience_ratio=cycle_data.experience_ratio,
        acceptance_deadline=cycle_data.acceptance_deadline,
        status=MarkingCycleStatus.DRAFT,
    )

    session.add(cycle)
    await session.commit()
    await session.refresh(cycle)

    return MarkingCycleResponse.model_validate(cycle)


@router.get("", response_model=list[MarkingCycleResponse])
async def list_marking_cycles(
    session: DBSessionDep,
    current_user: AdminDep,
    year: int | None = None,
    status_filter: MarkingCycleStatus | None = None,
) -> list[MarkingCycleResponse]:
    """List marking cycles."""
    stmt = select(MarkingCycle)

    if year:
        stmt = stmt.where(MarkingCycle.year == year)

    if status_filter:
        stmt = stmt.where(MarkingCycle.status == status_filter)

    stmt = stmt.order_by(MarkingCycle.year.desc(), MarkingCycle.created_at.desc())
    result = await session.execute(stmt)
    cycles = result.scalars().all()

    return [MarkingCycleResponse.model_validate(cycle) for cycle in cycles]


@router.get("/{cycle_id}", response_model=MarkingCycleResponse)
async def get_marking_cycle(
    cycle_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> MarkingCycleResponse:
    """Get a specific marking cycle."""
    stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    result = await session.execute(stmt)
    cycle = result.scalar_one_or_none()

    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marking cycle not found",
        )

    return MarkingCycleResponse.model_validate(cycle)


@router.put("/{cycle_id}", response_model=MarkingCycleResponse)
async def update_marking_cycle(
    cycle_id: UUID,
    cycle_data: MarkingCycleUpdate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> MarkingCycleResponse:
    """Update a marking cycle."""
    stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    result = await session.execute(stmt)
    cycle = result.scalar_one_or_none()

    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marking cycle not found",
        )

    update_data = cycle_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cycle, field, value)

    await session.commit()
    await session.refresh(cycle)

    return MarkingCycleResponse.model_validate(cycle)


@router.post("/{cycle_id}/open", response_model=MarkingCycleResponse)
async def open_marking_cycle(
    cycle_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> MarkingCycleResponse:
    """Open a marking cycle for allocation."""
    stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    result = await session.execute(stmt)
    cycle = result.scalar_one_or_none()

    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marking cycle not found",
        )

    cycle.status = MarkingCycleStatus.OPEN
    await session.commit()
    await session.refresh(cycle)

    return MarkingCycleResponse.model_validate(cycle)


@router.post("/{cycle_id}/close", response_model=MarkingCycleResponse)
async def close_marking_cycle(
    cycle_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> MarkingCycleResponse:
    """Close a marking cycle."""
    stmt = select(MarkingCycle).where(MarkingCycle.id == cycle_id)
    result = await session.execute(stmt)
    cycle = result.scalar_one_or_none()

    if not cycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marking cycle not found",
        )

    cycle.status = MarkingCycleStatus.CLOSED
    await session.commit()
    await session.refresh(cycle)

    return MarkingCycleResponse.model_validate(cycle)


@router.post("/{cycle_id}/archive", response_model=dict)
async def archive_marking_cycle(
    cycle_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Archive a completed marking cycle."""
    from app.services.archive_service import archive_cycle

    try:
        result = await archive_cycle(session, cycle_id)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
