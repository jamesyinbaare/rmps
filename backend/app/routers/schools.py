from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, insert, select

from app.dependencies.database import DBSessionDep
from app.models import Document, Programme, School, Subject, school_programmes, school_subjects
from app.schemas.programme import SchoolProgrammeAssociation
from app.schemas.school import (
    SchoolCreate,
    SchoolResponse,
    SchoolStatistics,
    SchoolSubjectAssociation,
    SchoolUpdate,
)

router = APIRouter(prefix="/api/v1/schools", tags=["schools"])


@router.post("", response_model=SchoolResponse, status_code=status.HTTP_201_CREATED)
async def create_school(school: SchoolCreate, session: DBSessionDep) -> SchoolResponse:
    """Create a new school."""
    # Check if code already exists
    stmt = select(School).where(School.code == school.code)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"School with code {school.code} already exists"
        )

    db_school = School(
        code=school.code,
        name=school.name,
        region=school.region,
        zone=school.zone,
        school_type=school.school_type,
    )
    session.add(db_school)
    await session.commit()
    await session.refresh(db_school)
    return SchoolResponse.model_validate(db_school)


@router.get("", response_model=list[SchoolResponse])
async def list_schools(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> list[SchoolResponse]:
    """List schools with pagination."""
    offset = (page - 1) * page_size
    stmt = select(School).offset(offset).limit(page_size).order_by(School.code)
    result = await session.execute(stmt)
    schools = result.scalars().all()
    return [SchoolResponse.model_validate(school) for school in schools]


@router.get("/{school_code}", response_model=SchoolResponse)
async def get_school(school_code: str, session: DBSessionDep) -> SchoolResponse:
    """Get school details."""
    stmt = select(School).where(School.code == school_code)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    return SchoolResponse.model_validate(school)


@router.put("/{school_code}", response_model=SchoolResponse)
async def update_school(school_code: str, school_update: SchoolUpdate, session: DBSessionDep) -> SchoolResponse:
    """Update school."""
    stmt = select(School).where(School.code == school_code)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    if school_update.name is not None:
        school.name = school_update.name
    if school_update.region is not None:
        school.region = school_update.region
    if school_update.zone is not None:
        school.zone = school_update.zone
    if school_update.school_type is not None:
        school.school_type = school_update.school_type

    await session.commit()
    await session.refresh(school)
    return SchoolResponse.model_validate(school)


@router.delete("/{school_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_school(school_code: str, session: DBSessionDep) -> None:
    """Delete school."""
    stmt = select(School).where(School.code == school_code)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    await session.delete(school)
    await session.commit()


@router.get("/{school_id}/statistics", response_model=SchoolStatistics)
async def get_school_statistics(school_id: int, session: DBSessionDep) -> SchoolStatistics:
    """Get school statistics."""
    stmt = select(School).where(School.id == school_id)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Count total documents
    doc_count_stmt = select(func.count(Document.id)).where(Document.school_id == school_id)
    doc_result = await session.execute(doc_count_stmt)
    total_documents = doc_result.scalar() or 0

    # Count total subjects
    subject_count_stmt = select(func.count(school_subjects.c.subject_id)).where(
        school_subjects.c.school_id == school_id
    )
    subject_result = await session.execute(subject_count_stmt)
    total_subjects = subject_result.scalar() or 0

    # Count documents by test type
    test_type_stmt = (
        select(Document.test_type, func.count(Document.id))
        .where(Document.school_id == school_id, Document.test_type.isnot(None))
        .group_by(Document.test_type)
    )
    test_type_result = await session.execute(test_type_stmt)
    documents_by_test_type: dict[str, int] = {str(row[0]): row[1] for row in test_type_result.all()}

    return SchoolStatistics(
        school_id=school.id,
        school_code=school.code,
        school_name=school.name,
        total_documents=total_documents,
        total_subjects=total_subjects,
        documents_by_test_type=documents_by_test_type,
    )


@router.get("/{school_id}/subjects", response_model=list[Any])
async def list_school_subjects(school_id: int, session: DBSessionDep) -> list[Any]:
    """List subjects for a school."""
    stmt = select(School).where(School.id == school_id)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get subjects via association
    subject_stmt = (
        select(Subject)
        .join(school_subjects, Subject.id == school_subjects.c.subject_id)
        .where(school_subjects.c.school_id == school_id)
    )
    subject_result = await session.execute(subject_stmt)
    subjects = subject_result.scalars().all()

    from app.schemas.subject import SubjectResponse

    return [SubjectResponse.model_validate(subject) for subject in subjects]


@router.post("/{school_id}/subjects/{subject_id}", status_code=status.HTTP_201_CREATED)
async def associate_subject_with_school(
    school_id: int, subject_id: int, session: DBSessionDep
) -> SchoolSubjectAssociation:
    """Associate a subject with a school."""
    # Check school exists
    school_stmt = select(School).where(School.id == school_id)
    result = await session.execute(school_stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Check if association already exists
    assoc_stmt = select(school_subjects).where(
        school_subjects.c.school_id == school_id, school_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject already associated with school")

    # Create association
    await session.execute(insert(school_subjects).values(school_id=school_id, subject_id=subject_id))
    await session.commit()

    return SchoolSubjectAssociation(school_id=school_id, subject_id=subject_id)


@router.delete("/{school_id}/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_association(school_id: int, subject_id: int, session: DBSessionDep) -> None:
    """Remove subject association from school."""
    # Check association exists
    assoc_stmt = select(school_subjects).where(
        school_subjects.c.school_id == school_id, school_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject association not found")

    await session.execute(
        delete(school_subjects).where(
            school_subjects.c.school_id == school_id, school_subjects.c.subject_id == subject_id
        )
    )
    await session.commit()


@router.get("/{school_id}/subjects/{subject_id}/statistics", response_model=Any)
async def get_subject_statistics_for_school(school_id: int, subject_id: int, session: DBSessionDep) -> Any:
    """Get subject statistics for a specific school."""
    # Check school exists
    school_stmt = select(School).where(School.id == school_id)
    result = await session.execute(school_stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Check association
    assoc_stmt = select(school_subjects).where(
        school_subjects.c.school_id == school_id, school_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not associated with school")

    # Count documents for this school+subject
    doc_count_stmt = select(func.count(Document.id)).where(
        Document.school_id == school_id, Document.subject_id == subject_id
    )
    doc_result = await session.execute(doc_count_stmt)
    total_documents = doc_result.scalar() or 0

    # Count by test type
    test_type_stmt = (
        select(Document.test_type, func.count(Document.id))
        .where(
            Document.school_id == school_id,
            Document.subject_id == subject_id,
            Document.test_type.isnot(None),
        )
        .group_by(Document.test_type)
    )
    test_type_result = await session.execute(test_type_stmt)
    documents_by_test_type: dict[str, int] = {str(row[0]): row[1] for row in test_type_result.all()}

    # Find sequence gaps
    sheet_stmt = (
        select(Document.sheet_number)
        .where(
            Document.school_id == school_id,
            Document.subject_id == subject_id,
            Document.sheet_number.isnot(None),
        )
        .order_by(Document.sheet_number)
    )
    sheet_result = await session.execute(sheet_stmt)
    sheet_numbers = [int(row[0]) for row in sheet_result.all() if row[0] and row[0].isdigit()]
    sequence_gaps: list[int] = []
    if sheet_numbers:
        min_sheet = min(sheet_numbers)
        max_sheet = max(sheet_numbers)
        existing_set = set(sheet_numbers)
        sequence_gaps = [i for i in range(min_sheet, max_sheet + 1) if i not in existing_set]

    from app.schemas.subject import SubjectStatistics

    return SubjectStatistics(
        subject_id=subject.id,
        subject_code=subject.code,
        subject_name=subject.name,
        total_documents=total_documents,
        total_schools=1,  # For this specific school
        documents_by_test_type=documents_by_test_type,
        sheet_sequence_gaps=sequence_gaps,
    )


# School-Programme Association Endpoints


@router.get("/{school_id}/programmes", response_model=list[Any])
async def list_school_programmes(school_id: int, session: DBSessionDep) -> list[Any]:
    """List programmes for a school."""
    stmt = select(School).where(School.id == school_id)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get programmes via association
    programme_stmt = (
        select(Programme)
        .join(school_programmes, Programme.id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
        .order_by(Programme.code)
    )
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()

    from app.schemas.programme import ProgrammeResponse

    return [ProgrammeResponse.model_validate(programme) for programme in programmes]


@router.post("/{school_id}/programmes/{programme_id}", status_code=status.HTTP_201_CREATED)
async def associate_programme_with_school(
    school_id: int, programme_id: int, session: DBSessionDep
) -> SchoolProgrammeAssociation:
    """Associate a programme with a school."""
    # Check school exists
    school_stmt = select(School).where(School.id == school_id)
    result = await session.execute(school_stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Check programme exists
    programme_stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(programme_stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Check if association already exists
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == school_id, school_programmes.c.programme_id == programme_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Programme already associated with school"
        )

    # Create association
    await session.execute(insert(school_programmes).values(school_id=school_id, programme_id=programme_id))
    await session.commit()

    return SchoolProgrammeAssociation(school_id=school_id, programme_id=programme_id)


@router.delete("/{school_id}/programmes/{programme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_programme_association(school_id: int, programme_id: int, session: DBSessionDep) -> None:
    """Remove programme association from school."""
    # Check association exists
    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == school_id, school_programmes.c.programme_id == programme_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme association not found")

    await session.execute(
        delete(school_programmes).where(
            school_programmes.c.school_id == school_id, school_programmes.c.programme_id == programme_id
        )
    )
    await session.commit()
