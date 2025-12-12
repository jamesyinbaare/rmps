from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.database import DBSessionDep
from app.models import Document, Exam, ExamSubject, Subject
from app.schemas.exam import (
    ExamCreate,
    ExamListResponse,
    ExamResponse,
    ExamSubjectCreate,
    ExamSubjectResponse,
    ExamSubjectUpdate,
    ExamUpdate,
)

router = APIRouter(prefix="/api/v1/exams", tags=["exams"])


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(exam: ExamCreate, session: DBSessionDep) -> ExamResponse:
    """Create a new exam."""
    db_exam = Exam(
        name=exam.name,
        description=exam.description,
        year=exam.year,
        series=exam.series,
        number_of_series=exam.number_of_series,
    )
    session.add(db_exam)
    await session.commit()
    await session.refresh(db_exam)
    return ExamResponse.model_validate(db_exam)


@router.get("", response_model=ExamListResponse)
async def list_exams(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    year: int | None = Query(None, ge=1900, le=2100),
) -> ExamListResponse:
    """List exams with pagination and optional year filter."""
    offset = (page - 1) * page_size

    # Build query with optional year filter
    base_stmt = select(Exam)
    if year is not None:
        base_stmt = base_stmt.where(Exam.year == year)

    # Get total count
    count_stmt = select(func.count(Exam.id))
    if year is not None:
        count_stmt = count_stmt.where(Exam.year == year)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get exams
    stmt = base_stmt.offset(offset).limit(page_size).order_by(Exam.year.desc(), Exam.created_at.desc())
    result = await session.execute(stmt)
    exams = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return ExamListResponse(
        items=[ExamResponse.model_validate(exam) for exam in exams],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(exam_id: int, session: DBSessionDep) -> ExamResponse:
    """Get exam details."""
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    return ExamResponse.model_validate(exam)


@router.put("/{exam_id}", response_model=ExamResponse)
async def update_exam(exam_id: int, exam_update: ExamUpdate, session: DBSessionDep) -> ExamResponse:
    """Update exam."""
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if exam_update.name is not None:
        exam.name = exam_update.name
    if exam_update.description is not None:
        exam.description = exam_update.description
    if exam_update.year is not None:
        exam.year = exam_update.year
    if exam_update.series is not None:
        exam.series = exam_update.series
    if exam_update.number_of_series is not None:
        exam.number_of_series = exam_update.number_of_series

    await session.commit()
    await session.refresh(exam)
    return ExamResponse.model_validate(exam)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(exam_id: int, session: DBSessionDep) -> None:
    """Delete exam."""
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check if exam has associated documents (RESTRICT constraint)
    doc_count_stmt = select(func.count(Document.id)).where(Document.exam_id == exam_id)
    doc_result = await session.execute(doc_count_stmt)
    doc_count = doc_result.scalar() or 0
    if doc_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete exam with {doc_count} associated document(s). Remove documents first.",
        )

    await session.delete(exam)
    await session.commit()


@router.get("/{exam_id}/subjects", response_model=list[ExamSubjectResponse])
async def list_exam_subjects(exam_id: int, session: DBSessionDep) -> list[ExamSubjectResponse]:
    """List subjects for an exam."""
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get exam subjects with subject details
    exam_subject_stmt = (
        select(ExamSubject, Subject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id)
        .order_by(Subject.code)
    )
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subjects = exam_subject_result.all()

    return [
        ExamSubjectResponse(
            id=exam_subject.id,
            exam_id=exam_subject.exam_id,
            subject_id=exam_subject.subject_id,
            subject_code=subject.code,
            subject_name=subject.name,
            mcq_percentage=exam_subject.mcq_percentage,
            essay_percentage=exam_subject.essay_percentage,
            practical_percentage=exam_subject.practical_percentage,
            created_at=exam_subject.created_at,
            updated_at=exam_subject.updated_at,
        )
        for exam_subject, subject in exam_subjects
    ]


@router.post("/{exam_id}/subjects", response_model=ExamSubjectResponse, status_code=status.HTTP_201_CREATED)
async def add_subject_to_exam(
    exam_id: int, exam_subject: ExamSubjectCreate, session: DBSessionDep
) -> ExamSubjectResponse:
    """Add a subject to an exam."""
    # Check exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Check subject exists
    subject_stmt = select(Subject).where(Subject.id == exam_subject.subject_id)
    subject_result = await session.execute(subject_stmt)
    subject = subject_result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    # Check if subject already added to exam
    existing_stmt = select(ExamSubject).where(
        ExamSubject.exam_id == exam_id, ExamSubject.subject_id == exam_subject.subject_id
    )
    existing_result = await session.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject already added to this exam")

    # Validate percentages sum to 100
    total_percentage = exam_subject.mcq_percentage + exam_subject.essay_percentage
    if exam_subject.practical_percentage is not None:
        total_percentage += exam_subject.practical_percentage
    if abs(total_percentage - 100.0) > 0.01:  # Allow small floating point differences
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Percentages must sum to 100. Current sum: {total_percentage}",
        )

    # Create exam subject
    db_exam_subject = ExamSubject(
        exam_id=exam_id,
        subject_id=exam_subject.subject_id,
        mcq_percentage=exam_subject.mcq_percentage,
        essay_percentage=exam_subject.essay_percentage,
        practical_percentage=exam_subject.practical_percentage,
    )
    session.add(db_exam_subject)
    await session.commit()
    await session.refresh(db_exam_subject)

    return ExamSubjectResponse(
        id=db_exam_subject.id,
        exam_id=db_exam_subject.exam_id,
        subject_id=db_exam_subject.subject_id,
        subject_code=subject.code,
        subject_name=subject.name,
        mcq_percentage=db_exam_subject.mcq_percentage,
        essay_percentage=db_exam_subject.essay_percentage,
        practical_percentage=db_exam_subject.practical_percentage,
        created_at=db_exam_subject.created_at,
        updated_at=db_exam_subject.updated_at,
    )


@router.put("/{exam_id}/subjects/{subject_id}", response_model=ExamSubjectResponse)
async def update_exam_subject(
    exam_id: int, subject_id: int, exam_subject_update: ExamSubjectUpdate, session: DBSessionDep
) -> ExamSubjectResponse:
    """Update exam subject percentages."""
    # Check exam subject exists
    exam_subject_stmt = (
        select(ExamSubject, Subject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id, ExamSubject.subject_id == subject_id)
    )
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject_data = exam_subject_result.first()
    if not exam_subject_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam subject not found")

    exam_subject, subject = exam_subject_data

    # Update percentages
    mcq_percentage = (
        exam_subject_update.mcq_percentage
        if exam_subject_update.mcq_percentage is not None
        else exam_subject.mcq_percentage
    )
    essay_percentage = (
        exam_subject_update.essay_percentage
        if exam_subject_update.essay_percentage is not None
        else exam_subject.essay_percentage
    )
    practical_percentage = (
        exam_subject_update.practical_percentage
        if exam_subject_update.practical_percentage is not None
        else exam_subject.practical_percentage
    )

    if exam_subject_update.mcq_percentage is not None:
        exam_subject.mcq_percentage = exam_subject_update.mcq_percentage
    if exam_subject_update.essay_percentage is not None:
        exam_subject.essay_percentage = exam_subject_update.essay_percentage
    if exam_subject_update.practical_percentage is not None:
        exam_subject.practical_percentage = exam_subject_update.practical_percentage

    # Validate percentages sum to 100
    total_percentage = mcq_percentage + essay_percentage
    if practical_percentage is not None:
        total_percentage += practical_percentage
    if abs(total_percentage - 100.0) > 0.01:  # Allow small floating point differences
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Percentages must sum to 100. Current sum: {total_percentage}",
        )

    await session.commit()
    await session.refresh(exam_subject)

    return ExamSubjectResponse(
        id=exam_subject.id,
        exam_id=exam_subject.exam_id,
        subject_id=exam_subject.subject_id,
        subject_code=subject.code,
        subject_name=subject.name,
        mcq_percentage=exam_subject.mcq_percentage,
        essay_percentage=exam_subject.essay_percentage,
        practical_percentage=exam_subject.practical_percentage,
        created_at=exam_subject.created_at,
        updated_at=exam_subject.updated_at,
    )


@router.delete("/{exam_id}/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_from_exam(exam_id: int, subject_id: int, session: DBSessionDep) -> None:
    """Remove subject from exam."""
    # Check exam subject exists
    exam_subject_stmt = select(ExamSubject).where(ExamSubject.exam_id == exam_id, ExamSubject.subject_id == subject_id)
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject = exam_subject_result.scalar_one_or_none()
    if not exam_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam subject not found")

    await session.delete(exam_subject)
    await session.commit()


@router.get("/{exam_id}/statistics", response_model=dict[str, Any])
async def get_exam_statistics(exam_id: int, session: DBSessionDep) -> dict[str, Any]:
    """Get exam statistics."""
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Count total documents
    doc_count_stmt = select(func.count(Document.id)).where(Document.exam_id == exam_id)
    doc_result = await session.execute(doc_count_stmt)
    total_documents = doc_result.scalar() or 0

    # Count total subjects
    subject_count_stmt = select(func.count(ExamSubject.id)).where(ExamSubject.exam_id == exam_id)
    subject_result = await session.execute(subject_count_stmt)
    total_subjects = subject_result.scalar() or 0

    # Count documents by status
    status_stmt = (
        select(Document.status, func.count(Document.id)).where(Document.exam_id == exam_id).group_by(Document.status)
    )
    status_result = await session.execute(status_stmt)
    documents_by_status: dict[str, int] = {row[0]: row[1] for row in status_result.all()}

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "exam_year": exam.year,
        "exam_series": exam.series,
        "total_documents": total_documents,
        "total_subjects": total_subjects,
        "documents_by_status": documents_by_status,
    }
