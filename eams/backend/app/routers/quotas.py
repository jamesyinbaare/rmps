"""Subject quota management endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import SubjectQuota
from app.schemas.allocation import SubjectQuotaCreate, SubjectQuotaResponse

router = APIRouter(prefix="/api/v1/admin/quotas", tags=["admin-quotas"])


@router.post("/cycles/{cycle_id}/subjects/{subject_id}", response_model=SubjectQuotaResponse, status_code=status.HTTP_201_CREATED)
async def create_subject_quota(
    cycle_id: UUID,
    subject_id: UUID,
    quota_data: SubjectQuotaCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectQuotaResponse:
    """Create a subject quota."""
    # Check if quota already exists
    existing_stmt = select(SubjectQuota).where(
        SubjectQuota.cycle_id == cycle_id,
        SubjectQuota.subject_id == subject_id,
        SubjectQuota.quota_type == quota_data.quota_type,
        SubjectQuota.quota_key == quota_data.quota_key,
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quota already exists for this cycle, subject, type, and key",
        )

    quota = SubjectQuota(
        cycle_id=cycle_id,
        subject_id=subject_id,
        quota_type=quota_data.quota_type,
        quota_key=quota_data.quota_key,
        min_count=quota_data.min_count,
        max_count=quota_data.max_count,
        percentage=quota_data.percentage,
    )

    session.add(quota)
    await session.commit()
    await session.refresh(quota)

    return SubjectQuotaResponse.model_validate(quota)


@router.get("/cycles/{cycle_id}/subjects/{subject_id}", response_model=list[SubjectQuotaResponse])
async def list_subject_quotas(
    cycle_id: UUID,
    subject_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> list[SubjectQuotaResponse]:
    """List quotas for a cycle and subject."""
    stmt = select(SubjectQuota).where(
        SubjectQuota.cycle_id == cycle_id,
        SubjectQuota.subject_id == subject_id,
    )
    result = await session.execute(stmt)
    quotas = result.scalars().all()

    return [SubjectQuotaResponse.model_validate(quota) for quota in quotas]


@router.put("/{quota_id}", response_model=SubjectQuotaResponse)
async def update_subject_quota(
    quota_id: UUID,
    quota_data: SubjectQuotaCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectQuotaResponse:
    """Update a subject quota."""
    stmt = select(SubjectQuota).where(SubjectQuota.id == quota_id)
    result = await session.execute(stmt)
    quota = result.scalar_one_or_none()

    if not quota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found",
        )

    quota.min_count = quota_data.min_count
    quota.max_count = quota_data.max_count
    quota.percentage = quota_data.percentage

    await session.commit()
    await session.refresh(quota)

    return SubjectQuotaResponse.model_validate(quota)


@router.delete("/{quota_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject_quota(
    quota_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> None:
    """Delete a subject quota."""
    stmt = select(SubjectQuota).where(SubjectQuota.id == quota_id)
    result = await session.execute(stmt)
    quota = result.scalar_one_or_none()

    if not quota:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quota not found",
        )

    await session.delete(quota)
    await session.commit()
