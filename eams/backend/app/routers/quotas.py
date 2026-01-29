"""Subject quota management endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import QuotaType, SubjectQuota
from app.schemas.invitation import (
    SubjectQuotaBulkUpdate,
    SubjectQuotaCreate,
    SubjectQuotaResponse,
)
from app.services.quota_validator import validate_quotas_against_required

router = APIRouter(prefix="/api/v1/admin/quotas", tags=["admin-quotas"])


@router.post("/subject-examiners/{subject_examiner_id}", response_model=SubjectQuotaResponse, status_code=status.HTTP_201_CREATED)
async def create_subject_quota(
    subject_examiner_id: UUID,
    quota_data: SubjectQuotaCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectQuotaResponse:
    """Create a subject quota for a subject examiner."""
    from app.models import SubjectExaminer

    se_stmt = select(SubjectExaminer).where(SubjectExaminer.id == subject_examiner_id)
    se_result = await session.execute(se_stmt)
    se = se_result.scalar_one_or_none()
    if not se:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject examiner not found")
    subject_id = se.subject_id

    existing_stmt = select(SubjectQuota).where(
        SubjectQuota.subject_examiner_id == subject_examiner_id,
        SubjectQuota.subject_id == subject_id,
        SubjectQuota.quota_type == quota_data.quota_type,
        SubjectQuota.quota_key == quota_data.quota_key,
    )
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quota already exists for this subject examiner, subject, type, and key",
        )

    quota = SubjectQuota(
        subject_examiner_id=subject_examiner_id,
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


@router.put("/subject-examiners/{subject_examiner_id}", response_model=list[SubjectQuotaResponse])
async def bulk_update_subject_quotas(
    subject_examiner_id: UUID,
    payload: SubjectQuotaBulkUpdate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> list[SubjectQuotaResponse]:
    """Replace all quotas for this subject examiner with the payload."""
    from app.models import SubjectExaminer

    se_stmt = select(SubjectExaminer).where(SubjectExaminer.id == subject_examiner_id)
    se_result = await session.execute(se_stmt)
    se = se_result.scalar_one_or_none()
    if not se:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject examiner not found")
    subject_id = se.subject_id

    # Validate min/max counts against total_required
    region_items = [q.model_dump() for q in payload.region_quotas]
    gender_items = [q.model_dump() for q in payload.gender_quotas]
    valid, violations = validate_quotas_against_required(
        se.total_required, region_items, gender_items
    )
    if not valid:
        msg = "Quota validation failed: " + "; ".join(violations)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )

    await session.execute(
        delete(SubjectQuota).where(
            SubjectQuota.subject_examiner_id == subject_examiner_id,
            SubjectQuota.subject_id == subject_id,
        )
    )
    created: list[SubjectQuota] = []
    for item in payload.region_quotas:
        if item.min_count is not None or item.max_count is not None or item.percentage is not None:
            q = SubjectQuota(
                subject_examiner_id=subject_examiner_id,
                subject_id=subject_id,
                quota_type=QuotaType.REGION,
                quota_key=item.quota_key,
                min_count=item.min_count,
                max_count=item.max_count,
                percentage=item.percentage,
            )
            session.add(q)
            created.append(q)
    for item in payload.gender_quotas:
        if item.min_count is not None or item.max_count is not None or item.percentage is not None:
            q = SubjectQuota(
                subject_examiner_id=subject_examiner_id,
                subject_id=subject_id,
                quota_type=QuotaType.GENDER,
                quota_key=item.quota_key,
                min_count=item.min_count,
                max_count=item.max_count,
                percentage=item.percentage,
            )
            session.add(q)
            created.append(q)
    await session.commit()
    for q in created:
        await session.refresh(q)
    return [SubjectQuotaResponse.model_validate(q) for q in created]


@router.get("/subject-examiners/{subject_examiner_id}", response_model=list[SubjectQuotaResponse])
async def list_subject_quotas(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> list[SubjectQuotaResponse]:
    """List quotas for a subject examiner."""
    stmt = select(SubjectQuota).where(SubjectQuota.subject_examiner_id == subject_examiner_id)
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
