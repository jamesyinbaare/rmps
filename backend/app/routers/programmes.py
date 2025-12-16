from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, insert, select

from app.dependencies.database import DBSessionDep
from app.models import Programme, School, Subject, SubjectType, programme_subjects, school_programmes
from app.schemas.programme import (
    ProgrammeCreate,
    ProgrammeListResponse,
    ProgrammeResponse,
    ProgrammeSubjectAssociation,
    ProgrammeSubjectResponse,
    ProgrammeUpdate,
    SchoolProgrammeAssociation,
)

router = APIRouter(prefix="/api/v1/programmes", tags=["programmes"])


@router.post("", response_model=ProgrammeResponse, status_code=status.HTTP_201_CREATED)
async def create_programme(programme: ProgrammeCreate, session: DBSessionDep) -> ProgrammeResponse:
    """Create a new programme."""
    # Check if code already exists
    stmt = select(Programme).where(Programme.code == programme.code)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Programme with code {programme.code} already exists"
        )

    db_programme = Programme(code=programme.code, name=programme.name)
    session.add(db_programme)
    await session.commit()
    await session.refresh(db_programme)
    return ProgrammeResponse.model_validate(db_programme)


@router.get("", response_model=ProgrammeListResponse)
async def list_programmes(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ProgrammeListResponse:
    """List programmes with pagination."""
    offset = (page - 1) * page_size

    # Get total count
    count_stmt = select(func.count(Programme.id))
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get programmes
    stmt = select(Programme).offset(offset).limit(page_size).order_by(Programme.code)
    result = await session.execute(stmt)
    programmes = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return ProgrammeListResponse(
        items=[ProgrammeResponse.model_validate(programme) for programme in programmes],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{programme_id}", response_model=ProgrammeResponse)
async def get_programme(programme_id: int, session: DBSessionDep) -> ProgrammeResponse:
    """Get programme details."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")
    return ProgrammeResponse.model_validate(programme)


@router.put("/{programme_id}", response_model=ProgrammeResponse)
async def update_programme(
    programme_id: int, programme_update: ProgrammeUpdate, session: DBSessionDep
) -> ProgrammeResponse:
    """Update programme."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Check if code already exists (if updating code)
    if programme_update.code is not None and programme_update.code != programme.code:
        code_stmt = select(Programme).where(Programme.code == programme_update.code)
        code_result = await session.execute(code_stmt)
        existing = code_result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Programme with code {programme_update.code} already exists",
            )

    if programme_update.name is not None:
        programme.name = programme_update.name
    if programme_update.code is not None:
        programme.code = programme_update.code

    await session.commit()
    await session.refresh(programme)
    return ProgrammeResponse.model_validate(programme)


@router.delete("/{programme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_programme(programme_id: int, session: DBSessionDep) -> None:
    """Delete programme."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    await session.delete(programme)
    await session.commit()


# Programme-Subject Association Endpoints


@router.get("/{programme_id}/subjects", response_model=list[ProgrammeSubjectResponse])
async def list_programme_subjects(programme_id: int, session: DBSessionDep) -> list[ProgrammeSubjectResponse]:
    """List subjects for a programme."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Get subjects via association
    subject_stmt = (
        select(Subject, programme_subjects.c.created_at)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    subject_result = await session.execute(subject_stmt)
    subjects_data = subject_result.all()

    return [
        ProgrammeSubjectResponse(
            subject_id=subject.id,
            subject_code=subject.code,
            subject_name=subject.name,
            subject_type=subject.subject_type,
            created_at=created_at,
        )
        for subject, created_at in subjects_data
    ]


@router.post(
    "/{programme_id}/subjects/{subject_id}",
    response_model=ProgrammeSubjectAssociation,
    status_code=status.HTTP_201_CREATED,
)
async def associate_subject_with_programme(
    programme_id: int,
    subject_id: int,
    session: DBSessionDep,
) -> ProgrammeSubjectAssociation:
    """Associate a subject with a programme."""
    # Check programme exists
    programme_stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(programme_stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Check if association already exists
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Subject already associated with programme"
        )

    # Create association
    await session.execute(
        insert(programme_subjects).values(programme_id=programme_id, subject_id=subject_id)
    )
    await session.commit()

    return ProgrammeSubjectAssociation(programme_id=programme_id, subject_id=subject_id, subject_type=subject.subject_type)


@router.put(
    "/{programme_id}/subjects/{subject_id}",
    response_model=ProgrammeSubjectAssociation,
)
async def update_programme_subject_association(
    programme_id: int,
    subject_id: int,
    session: DBSessionDep,
    subject_type: SubjectType = Query(..., description="Subject type: CORE or ELECTIVE"),
) -> ProgrammeSubjectAssociation:
    """Update the subject_type for a subject (affects all programmes)."""
    # Check association exists
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject association not found")

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Update subject's type (this affects all programmes)
    from sqlalchemy import update

    await session.execute(
        update(Subject)
        .where(Subject.id == subject_id)
        .values(subject_type=subject_type)
    )
    await session.commit()

    return ProgrammeSubjectAssociation(programme_id=programme_id, subject_id=subject_id, subject_type=subject_type)


@router.delete("/{programme_id}/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_association(programme_id: int, subject_id: int, session: DBSessionDep) -> None:
    """Remove subject association from programme."""
    # Check association exists
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject association not found")

    await session.execute(
        delete(programme_subjects).where(
            programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
        )
    )
    await session.commit()


# School-Programme Association Endpoints


@router.get("/{programme_id}/schools", response_model=list[Any])
async def list_programme_schools(programme_id: int, session: DBSessionDep) -> list[Any]:
    """List schools that offer this programme."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Get schools via association
    school_stmt = (
        select(School)
        .join(school_programmes, School.id == school_programmes.c.school_id)
        .where(school_programmes.c.programme_id == programme_id)
        .order_by(School.code)
    )
    school_result = await session.execute(school_stmt)
    schools = school_result.scalars().all()

    from app.schemas.school import SchoolResponse

    return [SchoolResponse.model_validate(school) for school in schools]


@router.post(
    "/{programme_id}/schools/{school_id}",
    response_model=SchoolProgrammeAssociation,
    status_code=status.HTTP_201_CREATED,
)
async def associate_school_with_programme(
    programme_id: int, school_id: int, session: DBSessionDep
) -> SchoolProgrammeAssociation:
    """Associate a school with a programme."""
    # Check programme exists
    programme_stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(programme_stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Check school exists
    school_stmt = select(School).where(School.id == school_id)
    result = await session.execute(school_stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Check if association already exists
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.programme_id == programme_id, school_programmes.c.school_id == school_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="School already associated with programme"
        )

    # Create association
    await session.execute(insert(school_programmes).values(programme_id=programme_id, school_id=school_id))
    await session.commit()

    return SchoolProgrammeAssociation(school_id=school_id, programme_id=programme_id)


@router.delete("/{programme_id}/schools/{school_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_school_association(programme_id: int, school_id: int, session: DBSessionDep) -> None:
    """Remove school association from programme."""
    # Check association exists
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.programme_id == programme_id, school_programmes.c.school_id == school_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School association not found")

    await session.execute(
        delete(school_programmes).where(
            school_programmes.c.programme_id == programme_id, school_programmes.c.school_id == school_id
        )
    )
    await session.commit()
