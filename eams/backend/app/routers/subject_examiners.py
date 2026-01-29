"""Subject examiner management endpoints (get, update, open, close, archive)."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import MarkingCycleStatus, SubjectExaminer
from app.schemas.examination import SubjectExaminerResponse, SubjectExaminerUpdate

router = APIRouter(prefix="/api/v1/admin/subject-examiners", tags=["admin-subject-examiners"])


def _subject_examiner_to_response(se: SubjectExaminer) -> SubjectExaminerResponse:
    """Build response with optional examination display fields."""
    data = {
        "id": se.id,
        "examination_id": se.examination_id,
        "subject_id": se.subject_id,
        "total_required": se.total_required,
        "experience_ratio": se.experience_ratio,
        "status": se.status,
        "created_at": se.created_at,
        "updated_at": se.updated_at,
    }
    if se.examination:
        data["examination_type"] = se.examination.type
        data["examination_series"] = se.examination.series
        data["examination_year"] = se.examination.year
        data["acceptance_deadline"] = se.examination.acceptance_deadline
    return SubjectExaminerResponse.model_validate(data)


@router.get("/{subject_examiner_id}", response_model=SubjectExaminerResponse)
async def get_subject_examiner(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectExaminerResponse:
    """Get a subject examiner."""
    stmt = (
        select(SubjectExaminer)
        .where(SubjectExaminer.id == subject_examiner_id)
        .options(selectinload(SubjectExaminer.examination))
    )
    result = await session.execute(stmt)
    se = result.scalar_one_or_none()
    if not se:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject examiner not found",
        )
    return _subject_examiner_to_response(se)


@router.put("/{subject_examiner_id}", response_model=SubjectExaminerResponse)
async def update_subject_examiner(
    subject_examiner_id: UUID,
    data: SubjectExaminerUpdate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectExaminerResponse:
    """Update a subject examiner."""
    stmt = (
        select(SubjectExaminer)
        .where(SubjectExaminer.id == subject_examiner_id)
        .options(selectinload(SubjectExaminer.examination))
    )
    result = await session.execute(stmt)
    se = result.scalar_one_or_none()
    if not se:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject examiner not found",
        )
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(se, field, value)
    await session.commit()
    await session.refresh(se)
    await session.refresh(se, ["examination"])
    return _subject_examiner_to_response(se)


@router.post("/{subject_examiner_id}/open", response_model=SubjectExaminerResponse)
async def open_subject_examiner(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectExaminerResponse:
    """Open a subject examiner for allocation."""
    stmt = (
        select(SubjectExaminer)
        .where(SubjectExaminer.id == subject_examiner_id)
        .options(selectinload(SubjectExaminer.examination))
    )
    result = await session.execute(stmt)
    se = result.scalar_one_or_none()
    if not se:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject examiner not found",
        )
    se.status = MarkingCycleStatus.OPEN
    await session.commit()
    await session.refresh(se)
    await session.refresh(se, ["examination"])
    return _subject_examiner_to_response(se)


@router.post("/{subject_examiner_id}/close", response_model=SubjectExaminerResponse)
async def close_subject_examiner(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectExaminerResponse:
    """Close a subject examiner."""
    stmt = (
        select(SubjectExaminer)
        .where(SubjectExaminer.id == subject_examiner_id)
        .options(selectinload(SubjectExaminer.examination))
    )
    result = await session.execute(stmt)
    se = result.scalar_one_or_none()
    if not se:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject examiner not found",
        )
    se.status = MarkingCycleStatus.CLOSED
    await session.commit()
    await session.refresh(se)
    await session.refresh(se, ["examination"])
    return _subject_examiner_to_response(se)


@router.post("/{subject_examiner_id}/archive", response_model=dict)
async def archive_subject_examiner_endpoint(
    subject_examiner_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> dict:
    """Archive a completed subject examiner."""
    from app.services.archive_service import archive_subject_examiner

    try:
        result = await archive_subject_examiner(session, subject_examiner_id)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
