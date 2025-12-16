from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.database import DBSessionDep
from app.models import Document, Programme, School, Subject, programme_subjects, school_programmes
from app.schemas.subject import SubjectCreate, SubjectResponse, SubjectStatistics, SubjectUpdate

router = APIRouter(prefix="/api/v1/subjects", tags=["subjects"])


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(subject: SubjectCreate, session: DBSessionDep) -> SubjectResponse:
    """Create a new subject."""
    # Check if code already exists
    stmt = select(Subject).where(Subject.code == subject.code)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Subject with code {subject.code} already exists"
        )

    db_subject = Subject(
        code=subject.code,
        name=subject.name,
        subject_type=subject.subject_type,
    )
    session.add(db_subject)
    await session.commit()
    await session.refresh(db_subject)
    return SubjectResponse.model_validate(db_subject)


@router.get("", response_model=list[SubjectResponse])
async def list_subjects(
    session: DBSessionDep, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)
) -> list[SubjectResponse]:
    """List subjects with pagination."""
    offset = (page - 1) * page_size
    stmt = select(Subject).offset(offset).limit(page_size).order_by(Subject.code)
    result = await session.execute(stmt)
    subjects = result.scalars().all()
    return [SubjectResponse.model_validate(subject) for subject in subjects]


@router.get("/{subject_id}", response_model=SubjectResponse)
async def get_subject(subject_id: int, session: DBSessionDep) -> SubjectResponse:
    """Get subject details."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return SubjectResponse.model_validate(subject)


@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(subject_id: int, subject_update: SubjectUpdate, session: DBSessionDep) -> SubjectResponse:
    """Update subject."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    if subject_update.name is not None:
        subject.name = subject_update.name
    if subject_update.subject_type is not None:
        subject.subject_type = subject_update.subject_type

    await session.commit()
    await session.refresh(subject)
    return SubjectResponse.model_validate(subject)


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(subject_id: int, session: DBSessionDep) -> None:
    """Delete subject."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    await session.delete(subject)
    await session.commit()


@router.get("/{subject_id}/statistics", response_model=SubjectStatistics)
async def get_subject_statistics(subject_id: int, session: DBSessionDep) -> SubjectStatistics:
    """Get subject statistics across all schools."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Count total documents
    doc_count_stmt = select(func.count(Document.id)).where(Document.subject_id == subject_id)
    doc_result = await session.execute(doc_count_stmt)
    total_documents = doc_result.scalar() or 0

    # Count total schools offering this subject (through programmes)
    school_count_stmt = (
        select(func.count(func.distinct(school_programmes.c.school_id)))
        .select_from(school_programmes)
        .join(programme_subjects, school_programmes.c.programme_id == programme_subjects.c.programme_id)
        .where(programme_subjects.c.subject_id == subject_id)
    )
    school_result = await session.execute(school_count_stmt)
    total_schools = school_result.scalar() or 0

    # Count documents by test type
    test_type_stmt = (
        select(Document.test_type, func.count(Document.id))
        .where(Document.subject_id == subject_id, Document.test_type.isnot(None))
        .group_by(Document.test_type)
    )
    test_type_result = await session.execute(test_type_stmt)
    documents_by_test_type: dict[str, int] = {str(row[0]): row[1] for row in test_type_result.all()}

    # Find sequence gaps across all schools for this subject
    # Get all sheet numbers for this subject
    sheet_stmt = (
        select(Document.sheet_number, Document.school_id, Document.test_type)
        .where(
            Document.subject_id == subject_id,
            Document.sheet_number.isnot(None),
            Document.test_type.isnot(None),
        )
        .order_by(Document.school_id, Document.test_type, Document.sheet_number)
    )
    sheet_result = await session.execute(sheet_stmt)
    # Group by school_id and test_type to find gaps per combination
    gaps_by_combination: dict[tuple[int, str], list[int]] = {}
    for row in sheet_result.all():
        sheet_num = int(row[0]) if row[0] and row[0].isdigit() else None
        school_id = row[1]
        test_type = row[2]
        if sheet_num and school_id and test_type:
            key = (school_id, test_type)
            if key not in gaps_by_combination:
                gaps_by_combination[key] = []
            gaps_by_combination[key].append(sheet_num)

    # Calculate gaps for each combination
    all_gaps: list[int] = []
    for sheet_numbers in gaps_by_combination.values():
        if sheet_numbers:
            min_sheet = min(sheet_numbers)
            max_sheet = max(sheet_numbers)
            existing_set = set(sheet_numbers)
            gaps = [i for i in range(min_sheet, max_sheet + 1) if i not in existing_set]
            all_gaps.extend(gaps)

    # Remove duplicates and sort
    sequence_gaps = sorted(set(all_gaps))

    return SubjectStatistics(
        subject_id=subject.id,
        subject_code=subject.code,
        subject_name=subject.name,
        total_documents=total_documents,
        total_schools=total_schools,
        documents_by_test_type=documents_by_test_type,
        sheet_sequence_gaps=sequence_gaps,
    )


@router.get("/{subject_id}/schools", response_model=list[Any])
async def list_schools_for_subject(subject_id: int, session: DBSessionDep) -> list[Any]:
    """List schools that offer this subject."""
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Get schools through programmes
    school_stmt = (
        select(School)
        .join(school_programmes, School.id == school_programmes.c.school_id)
        .join(programme_subjects, school_programmes.c.programme_id == programme_subjects.c.programme_id)
        .where(programme_subjects.c.subject_id == subject_id)
        .distinct()
        .order_by(School.code)
    )
    school_result = await session.execute(school_stmt)
    schools = school_result.scalars().all()

    from app.schemas.school import SchoolResponse

    return [SchoolResponse.model_validate(school) for school in schools]
