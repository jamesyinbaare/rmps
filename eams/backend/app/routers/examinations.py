"""Examination and subject examiner list/create endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import AdminDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExamType, MarkingCycleStatus, Subject, SubjectExaminer
from app.schemas.examination import (
    ExaminationCreate,
    ExaminationResponse,
    ExaminationUpdate,
    SubjectExaminerCreate,
    SubjectExaminerResponse,
)

router = APIRouter(prefix="/api/v1/admin/examinations", tags=["admin-examinations"])


@router.post("", response_model=ExaminationResponse, status_code=status.HTTP_201_CREATED)
async def create_examination(
    data: ExaminationCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminationResponse:
    """Create a new examination."""
    existing_stmt = select(Examination).where(
        Examination.type == data.type,
        Examination.year == data.year,
    )
    if data.series is not None:
        existing_stmt = existing_stmt.where(Examination.series == data.series)
    else:
        existing_stmt = existing_stmt.where(Examination.series.is_(None))
    existing_result = await session.execute(existing_stmt)
    # Avoid duplicate (type, series, year)
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Examination already exists for this type, series, and year",
        )

    # Defaults for subject examiners created with the examination
    DEFAULT_TOTAL_REQUIRED = 10
    DEFAULT_EXPERIENCE_RATIO = 0.5

    examination = Examination(
        type=data.type,
        series=data.series,
        year=data.year,
        acceptance_deadline=data.acceptance_deadline,
    )
    session.add(examination)
    await session.flush()  # get examination.id before creating subject examiners

    # Create a subject examiner for every subject with default total_required and experience_ratio
    subjects_result = await session.execute(select(Subject))
    subjects = subjects_result.scalars().all()
    for subject in subjects:
        se = SubjectExaminer(
            examination_id=examination.id,
            subject_id=subject.id,
            total_required=DEFAULT_TOTAL_REQUIRED,
            experience_ratio=DEFAULT_EXPERIENCE_RATIO,
            status=MarkingCycleStatus.DRAFT,
        )
        session.add(se)

    await session.commit()
    await session.refresh(examination)
    return ExaminationResponse.model_validate(examination)


@router.get("", response_model=list[ExaminationResponse])
async def list_examinations(
    session: DBSessionDep,
    current_user: AdminDep,
    year: int | None = None,
    type_filter: ExamType | None = None,
) -> list[ExaminationResponse]:
    """List examinations."""
    stmt = select(Examination)
    if year is not None:
        stmt = stmt.where(Examination.year == year)
    if type_filter is not None:
        stmt = stmt.where(Examination.type == type_filter)
    stmt = stmt.order_by(Examination.year.desc(), Examination.created_at.desc())
    result = await session.execute(stmt)
    examinations = result.scalars().all()
    return [ExaminationResponse.model_validate(ex) for ex in examinations]


@router.get("/{examination_id}", response_model=ExaminationResponse)
async def get_examination(
    examination_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminationResponse:
    """Get a specific examination."""
    stmt = select(Examination).where(Examination.id == examination_id)
    result = await session.execute(stmt)
    examination = result.scalar_one_or_none()
    if not examination:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination not found",
        )
    return ExaminationResponse.model_validate(examination)


@router.put("/{examination_id}", response_model=ExaminationResponse)
async def update_examination(
    examination_id: UUID,
    data: ExaminationUpdate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> ExaminationResponse:
    """Update an examination."""
    stmt = select(Examination).where(Examination.id == examination_id)
    result = await session.execute(stmt)
    examination = result.scalar_one_or_none()
    if not examination:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination not found",
        )
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(examination, field, value)
    await session.commit()
    await session.refresh(examination)
    return ExaminationResponse.model_validate(examination)


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


@router.get("/{examination_id}/subject-examiners", response_model=list[SubjectExaminerResponse])
async def list_subject_examiners(
    examination_id: UUID,
    session: DBSessionDep,
    current_user: AdminDep,
    status_filter: MarkingCycleStatus | None = None,
) -> list[SubjectExaminerResponse]:
    """List subject examiners for an examination."""
    stmt = (
        select(SubjectExaminer)
        .where(SubjectExaminer.examination_id == examination_id)
        .options(selectinload(SubjectExaminer.examination))
    )
    if status_filter is not None:
        stmt = stmt.where(SubjectExaminer.status == status_filter)
    stmt = stmt.order_by(SubjectExaminer.created_at.desc())
    result = await session.execute(stmt)
    items = result.scalars().all()
    return [_subject_examiner_to_response(se) for se in items]


@router.post(
    "/{examination_id}/subject-examiners",
    response_model=SubjectExaminerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_subject_examiner(
    examination_id: UUID,
    data: SubjectExaminerCreate,
    session: DBSessionDep,
    current_user: AdminDep,
) -> SubjectExaminerResponse:
    """Create a subject examiner under an examination."""
    exam_stmt = select(Examination).where(Examination.id == examination_id)
    exam_result = await session.execute(exam_stmt)
    examination = exam_result.scalar_one_or_none()
    if not examination:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination not found",
        )

    existing_stmt = select(SubjectExaminer).where(
        SubjectExaminer.examination_id == examination_id,
        SubjectExaminer.subject_id == data.subject_id,
    )
    existing_result = await session.execute(existing_stmt)
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject examiner already exists for this examination and subject",
        )

    se = SubjectExaminer(
        examination_id=examination_id,
        subject_id=data.subject_id,
        total_required=data.total_required,
        experience_ratio=data.experience_ratio,
        status=MarkingCycleStatus.DRAFT,
    )
    session.add(se)
    await session.commit()
    await session.refresh(se)
    await session.refresh(se, ["examination"])
    return _subject_examiner_to_response(se)
