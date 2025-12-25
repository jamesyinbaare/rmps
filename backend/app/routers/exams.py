from typing import Any
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.dependencies.database import DBSessionDep
from app.models import Candidate, Document, Exam, ExamRegistration, ExamSeries, ExamSubject, ExamType, School, Subject, SubjectRegistration, SubjectType
from app.schemas.exam import (
    ExamCreate,
    ExamListResponse,
    ExamResponse,
    ExamSubjectBulkUploadResponse,
    ExamSubjectBulkUploadError,
    ExamSubjectCreate,
    ExamSubjectResponse,
    ExamSubjectUpdate,
    ExamUpdate,
    PdfGenerationJobCreate,
    PdfGenerationJobListResponse,
    PdfGenerationJobResponse,
    PdfGenerationResponse,
    ScoreSheetGenerationResponse,
    SerializationResponse,
)
from app.services.score_sheet_generator import generate_score_sheets
from app.services.score_sheet_pdf_service import combine_pdfs_for_school, generate_pdfs_for_exam
from app.services.serialization import serialize_exam
from app.services.template_generator import generate_exam_subject_template
from app.services.exam_subject_upload import (
    SubjectUploadParseError,
    SubjectUploadValidationError,
    parse_exam_subject_row,
    parse_upload_file,
    validate_exam_subject_columns,
)
from app.background_tasks import start_pdf_generation_job

router = APIRouter(prefix="/api/v1/exams", tags=["exams"])


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(exam: ExamCreate, session: DBSessionDep) -> ExamResponse:
    """Create a new exam."""
    # Check if exam with same exam_type, series, and year already exists
    stmt = select(Exam).where(
        Exam.exam_type == exam.exam_type,
        Exam.series == exam.series,
        Exam.year == exam.year,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        # Get string values from enums for user-friendly error message
        exam_type_str = exam.exam_type.value if hasattr(exam.exam_type, 'value') else str(exam.exam_type)
        series_str = exam.series.value if hasattr(exam.series, 'value') else str(exam.series)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Examination with type '{exam_type_str}', series '{series_str}', and year {exam.year} already exists",
        )

    db_exam = Exam(
        exam_type=exam.exam_type,
        description=exam.description,
        year=exam.year,
        series=exam.series,
        number_of_series=exam.number_of_series,
    )
    session.add(db_exam)
    try:
        await session.commit()
        await session.refresh(db_exam)

        # Auto-register all subjects with matching exam_type
        subjects_stmt = select(Subject).where(Subject.exam_type == exam.exam_type)
        subjects_result = await session.execute(subjects_stmt)
        subjects = subjects_result.scalars().all()

        for subject in subjects:
            # Check if subject is already registered
            existing_exam_subject_stmt = select(ExamSubject).where(
                ExamSubject.exam_id == db_exam.id, ExamSubject.subject_id == subject.id
            )
            existing_exam_subject_result = await session.execute(existing_exam_subject_stmt)
            existing_exam_subject = existing_exam_subject_result.scalar_one_or_none()

            if not existing_exam_subject:
                # Create ExamSubject with NULL values for percentages and scores
                exam_subject = ExamSubject(
                    exam_id=db_exam.id,
                    subject_id=subject.id,
                    obj_pct=None,
                    essay_pct=None,
                    pract_pct=None,
                    obj_max_score=None,
                    essay_max_score=None,
                    pract_max_score=None,
                )
                session.add(exam_subject)

        await session.commit()
        await session.refresh(db_exam)
        return ExamResponse.model_validate(db_exam)
    except IntegrityError as e:
        await session.rollback()
        # Check if it's a unique constraint violation
        error_str = str(e.orig) if hasattr(e, 'orig') else str(e)
        if "uq_exam_exam_type_series_year" in error_str or "unique constraint" in error_str.lower() or "duplicate" in error_str.lower():
            # Get string values from enums for user-friendly error message
            exam_type_str = exam.exam_type.value if hasattr(exam.exam_type, 'value') else str(exam.exam_type)
            series_str = exam.series.value if hasattr(exam.series, 'value') else str(exam.series)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Examination with type '{exam_type_str}', series '{series_str}', and year {exam.year} already exists",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create examination due to database constraint violation",
        )


@router.get("", response_model=ExamListResponse)
async def list_exams(
    session: DBSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    exam_type: ExamType = Query(..., description="Examination type"),
    series: ExamSeries = Query(..., description="Examination series"),
    year: int = Query(..., ge=1900, le=2100, description="Examination year"),
) -> ExamListResponse:
    """List exams with pagination, filtering by examination type, series, and year."""
    offset = (page - 1) * page_size

    # Build query with required filters
    base_stmt = select(Exam).where(
        Exam.exam_type == exam_type,
        Exam.series == series,
        Exam.year == year,
    )

    # Get total count
    count_stmt = select(func.count(Exam.id)).where(
        Exam.exam_type == exam_type,
        Exam.series == series,
        Exam.year == year,
    )
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

    # Determine the new values for exam_type, series, and year
    new_exam_type = exam_update.exam_type if exam_update.exam_type is not None else exam.exam_type
    new_series = exam_update.series if exam_update.series is not None else exam.series
    new_year = exam_update.year if exam_update.year is not None else exam.year

    # Check if exam_type is being updated
    exam_type_changing = exam_update.exam_type is not None and exam_update.exam_type != exam.exam_type

    # If exam_type is changing, check if candidates have registered
    if exam_type_changing:
        registration_count_stmt = select(func.count(ExamRegistration.id)).where(
            ExamRegistration.exam_id == exam_id
        )
        registration_count_result = await session.execute(registration_count_stmt)
        registration_count = registration_count_result.scalar() or 0

        if registration_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot change exam type because {registration_count} candidate(s) have already registered for this exam",
            )

    # Check if updating exam_type, series, or year would create a duplicate
    if (
        (exam_update.exam_type is not None and exam_update.exam_type != exam.exam_type)
        or (exam_update.series is not None and exam_update.series != exam.series)
        or (exam_update.year is not None and exam_update.year != exam.year)
    ):
        duplicate_stmt = select(Exam).where(
            Exam.exam_type == new_exam_type,
            Exam.series == new_series,
            Exam.year == new_year,
            Exam.id != exam_id,
        )
        duplicate_result = await session.execute(duplicate_stmt)
        existing = duplicate_result.scalar_one_or_none()
        if existing:
            # Get string values from enums for user-friendly error message
            exam_type_str = new_exam_type.value if hasattr(new_exam_type, 'value') else str(new_exam_type)
            series_str = new_series.value if hasattr(new_series, 'value') else str(new_series)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Examination with type '{exam_type_str}', series '{series_str}', and year {new_year} already exists",
            )

    if exam_update.exam_type is not None:
        exam.exam_type = exam_update.exam_type
    if exam_update.description is not None:
        exam.description = exam_update.description
    if exam_update.year is not None:
        exam.year = exam_update.year
    if exam_update.series is not None:
        exam.series = exam_update.series
    if exam_update.number_of_series is not None:
        exam.number_of_series = exam_update.number_of_series

    try:
        await session.flush()  # Flush to ensure exam is updated in session

        # If exam_type changed, update subjects
        if exam_type_changing:
            # Get current ExamSubject records
            current_exam_subjects_stmt = select(ExamSubject).where(ExamSubject.exam_id == exam_id)
            current_exam_subjects_result = await session.execute(current_exam_subjects_stmt)
            current_exam_subjects = current_exam_subjects_result.scalars().all()

            # Get subjects with new exam_type
            new_subjects_stmt = select(Subject).where(Subject.exam_type == new_exam_type)
            new_subjects_result = await session.execute(new_subjects_stmt)
            new_subjects = new_subjects_result.scalars().all()
            new_subject_ids = {subject.id for subject in new_subjects}

            # Remove ExamSubject records for subjects that don't match the new exam_type
            for exam_subject in current_exam_subjects:
                if exam_subject.subject_id not in new_subject_ids:
                    await session.delete(exam_subject)

            # Add ExamSubject records for subjects with new exam_type that aren't already registered
            existing_exam_subject_ids = {es.subject_id for es in current_exam_subjects}
            for subject in new_subjects:
                if subject.id not in existing_exam_subject_ids:
                    exam_subject = ExamSubject(
                        exam_id=exam_id,
                        subject_id=subject.id,
                        obj_pct=None,
                        essay_pct=None,
                        pract_pct=None,
                        obj_max_score=None,
                        essay_max_score=None,
                        pract_max_score=None,
                    )
                    session.add(exam_subject)

        await session.commit()
        await session.refresh(exam)
        return ExamResponse.model_validate(exam)
    except IntegrityError as e:
        await session.rollback()
        # Check if it's a unique constraint violation
        error_str = str(e.orig) if hasattr(e, 'orig') else str(e)
        if "uq_exam_exam_type_series_year" in error_str or "unique constraint" in error_str.lower() or "duplicate" in error_str.lower():
            # Get string values from enums for user-friendly error message
            exam_type_str = new_exam_type.value if hasattr(new_exam_type, 'value') else str(new_exam_type)
            series_str = new_series.value if hasattr(new_series, 'value') else str(new_series)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Examination with type '{exam_type_str}', series '{series_str}', and year {new_year} already exists",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update examination due to database constraint violation",
        )


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
            subject_type=subject.subject_type,
            obj_pct=exam_subject.obj_pct,
            essay_pct=exam_subject.essay_pct,
            pract_pct=exam_subject.pract_pct,
            obj_max_score=exam_subject.obj_max_score,
            essay_max_score=exam_subject.essay_max_score,
            pract_max_score=exam_subject.pract_max_score,
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

    # Validate percentages sum to 100 if all are provided
    if exam_subject.obj_pct is not None and exam_subject.essay_pct is not None:
        total_percentage = exam_subject.obj_pct + exam_subject.essay_pct
        if exam_subject.pract_pct is not None:
            total_percentage += exam_subject.pract_pct
        if abs(total_percentage - 100.0) > 0.01:  # Allow small floating point differences
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Percentages must sum to 100. Current sum: {total_percentage}",
            )

    # Create exam subject
    db_exam_subject = ExamSubject(
        exam_id=exam_id,
        subject_id=exam_subject.subject_id,
        obj_pct=exam_subject.obj_pct,
        essay_pct=exam_subject.essay_pct,
        pract_pct=exam_subject.pract_pct,
        obj_max_score=exam_subject.obj_max_score,
        essay_max_score=exam_subject.essay_max_score,
        pract_max_score=exam_subject.pract_max_score,
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
        subject_type=subject.subject_type,
        obj_pct=db_exam_subject.obj_pct,
        essay_pct=db_exam_subject.essay_pct,
        pract_pct=db_exam_subject.pract_pct,
        obj_max_score=db_exam_subject.obj_max_score,
        essay_max_score=db_exam_subject.essay_max_score,
        pract_max_score=db_exam_subject.pract_max_score,
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
    obj_pct = (
        exam_subject_update.obj_pct
        if exam_subject_update.obj_pct is not None
        else exam_subject.obj_pct
    )
    essay_pct = (
        exam_subject_update.essay_pct
        if exam_subject_update.essay_pct is not None
        else exam_subject.essay_pct
    )
    pract_pct = (
        exam_subject_update.pract_pct
        if exam_subject_update.pract_pct is not None
        else exam_subject.pract_pct
    )

    if exam_subject_update.obj_pct is not None:
        exam_subject.obj_pct = exam_subject_update.obj_pct
    if exam_subject_update.essay_pct is not None:
        exam_subject.essay_pct = exam_subject_update.essay_pct
    if exam_subject_update.pract_pct is not None:
        exam_subject.pract_pct = exam_subject_update.pract_pct
    if exam_subject_update.obj_max_score is not None:
        exam_subject.obj_max_score = exam_subject_update.obj_max_score
    if exam_subject_update.essay_max_score is not None:
        exam_subject.essay_max_score = exam_subject_update.essay_max_score
    if exam_subject_update.pract_max_score is not None:
        exam_subject.pract_max_score = exam_subject_update.pract_max_score

    # Validate percentages sum to 100 if all are provided
    if obj_pct is not None and essay_pct is not None:
        total_percentage = obj_pct + essay_pct
        if pract_pct is not None:
            total_percentage += pract_pct
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
        subject_type=subject.subject_type,
        obj_pct=exam_subject.obj_pct,
        essay_pct=exam_subject.essay_pct,
        pract_pct=exam_subject.pract_pct,
        obj_max_score=exam_subject.obj_max_score,
        essay_max_score=exam_subject.essay_max_score,
        pract_max_score=exam_subject.pract_max_score,
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


@router.get("/{exam_id}/subjects/template")
async def download_exam_subject_template(
    exam_id: int,
    subject_type: SubjectType | None = Query(None, description="Filter by subject type (CORE or ELECTIVE)"),
    session: DBSessionDep = ...,
) -> StreamingResponse:
    """Download Excel template for exam subject upload."""
    # Validate exam exists
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        template_bytes = await generate_exam_subject_template(session, exam_id, subject_type)
        filename = f"exam_{exam_id}_subjects_template.xlsx"
        if subject_type:
            filename = f"exam_{exam_id}_subjects_{subject_type.value.lower()}_template.xlsx"
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


@router.post("/{exam_id}/subjects/bulk-upload", response_model=ExamSubjectBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_exam_subjects(
    exam_id: int,
    session: DBSessionDep,
    file: UploadFile = File(...),
) -> ExamSubjectBulkUploadResponse:
    """Bulk upload/update exam subjects from Excel or CSV file."""
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_upload_file(file_content, file.filename or "unknown")
        validate_exam_subject_columns(df)
    except (SubjectUploadParseError, SubjectUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Get exam subjects by original_code for lookup
    exam_subject_stmt = (
        select(ExamSubject, Subject)
        .join(Subject, ExamSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id)
    )
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subjects_data = exam_subject_result.all()
    exam_subjects_by_original_code = {
        subject.original_code: (exam_subject, subject) for exam_subject, subject in exam_subjects_data
    }

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[ExamSubjectBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        exam_subject_data = None
        try:
            # Parse row data
            exam_subject_data = parse_exam_subject_row(row)

            # Validate required fields
            if not exam_subject_data["original_code"]:
                errors.append(
                    ExamSubjectBulkUploadError(
                        row_number=row_number,
                        original_code="",
                        error_message="Original code is required",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            # Lookup exam subject by original_code
            original_code = exam_subject_data["original_code"]
            if original_code not in exam_subjects_by_original_code:
                errors.append(
                    ExamSubjectBulkUploadError(
                        row_number=row_number,
                        original_code=original_code,
                        error_message=f"Subject with original_code '{original_code}' not found in this exam",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            exam_subject, subject = exam_subjects_by_original_code[original_code]

            # Validate percentages sum to 100 if all are provided
            obj_pct = exam_subject_data["obj_pct"]
            essay_pct = exam_subject_data["essay_pct"]
            pract_pct = exam_subject_data["pract_pct"]

            if obj_pct is not None and essay_pct is not None:
                total_percentage = obj_pct + essay_pct
                if pract_pct is not None:
                    total_percentage += pract_pct
                if abs(total_percentage - 100.0) > 0.01:  # Allow small floating point differences
                    errors.append(
                        ExamSubjectBulkUploadError(
                            row_number=row_number,
                            original_code=original_code,
                            error_message=f"Percentages must sum to 100. Current sum: {total_percentage}",
                            field="obj_pct,essay_pct,pract_pct",
                        )
                    )
                    failed += 1
                    continue

            # Validate non-negative values
            if obj_pct is not None and obj_pct < 0:
                errors.append(
                    ExamSubjectBulkUploadError(
                        row_number=row_number,
                        original_code=original_code,
                        error_message="obj_pct must be >= 0",
                        field="obj_pct",
                    )
                )
                failed += 1
                continue

            if essay_pct is not None and essay_pct < 0:
                errors.append(
                    ExamSubjectBulkUploadError(
                        row_number=row_number,
                        original_code=original_code,
                        error_message="essay_pct must be >= 0",
                        field="essay_pct",
                    )
                )
                failed += 1
                continue

            if pract_pct is not None and pract_pct < 0:
                errors.append(
                    ExamSubjectBulkUploadError(
                        row_number=row_number,
                        original_code=original_code,
                        error_message="pract_pct must be >= 0",
                        field="pract_pct",
                    )
                )
                failed += 1
                continue

            # Validate max scores are positive
            obj_max_score = exam_subject_data["obj_max_score"]
            essay_max_score = exam_subject_data["essay_max_score"]

            if obj_max_score is not None and obj_max_score <= 0:
                errors.append(
                    ExamSubjectBulkUploadError(
                        row_number=row_number,
                        original_code=original_code,
                        error_message="obj_max_score must be > 0",
                        field="obj_max_score",
                    )
                )
                failed += 1
                continue

            if essay_max_score is not None and essay_max_score <= 0:
                errors.append(
                    ExamSubjectBulkUploadError(
                        row_number=row_number,
                        original_code=original_code,
                        error_message="essay_max_score must be > 0",
                        field="essay_max_score",
                    )
                )
                failed += 1
                continue

            # Update exam subject (only update if value is provided)
            if obj_pct is not None:
                exam_subject.obj_pct = obj_pct
            if essay_pct is not None:
                exam_subject.essay_pct = essay_pct
            if pract_pct is not None:
                exam_subject.pract_pct = pract_pct
            if obj_max_score is not None:
                exam_subject.obj_max_score = obj_max_score
            if essay_max_score is not None:
                exam_subject.essay_max_score = essay_max_score

            successful += 1

        except Exception as e:
            # Get original_code from exam_subject_data if available, otherwise use empty string
            error_original_code = ""
            if exam_subject_data:
                error_original_code = exam_subject_data.get("original_code", "")

            errors.append(
                ExamSubjectBulkUploadError(
                    row_number=row_number,
                    original_code=error_original_code,
                    error_message=f"Unexpected error: {str(e)}",
                    field=None,
                )
            )
            failed += 1
            continue

    # Commit all changes
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save changes: {str(e)}",
        )

    return ExamSubjectBulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
    )


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
        "exam_type": exam.exam_type.value if hasattr(exam.exam_type, 'value') else str(exam.exam_type),
        "exam_year": exam.year,
        "exam_series": exam.series.value if hasattr(exam.series, 'value') else str(exam.series),
        "total_documents": total_documents,
        "total_subjects": total_subjects,
        "documents_by_status": documents_by_status,
    }


@router.post("/{exam_id}/serialize", response_model=SerializationResponse, status_code=status.HTTP_200_OK)
async def serialize_exam_candidates(
    exam_id: int,
    session: DBSessionDep,
    school_id: int | None = Query(None, description="Optional school ID to serialize only that school"),
    subject_codes: list[str] = Query(default_factory=list, description="List of subject codes to serialize. Subjects not in this list will be assigned default series 1."),
) -> SerializationResponse:
    """
    Serialize candidates for an exam by assigning series numbers in round-robin fashion.

    For subjects specified in subject_codes:
    - Candidates are sorted by index_number
    - Series numbers 1 to number_of_series are assigned in round-robin fashion
    - The assigned series is stored in SubjectRegistration.series

    For subjects NOT in subject_codes:
    - All subject registrations are assigned a default series of 1

    This operation is idempotent - running it multiple times will overwrite existing series assignments.
    """
    try:
        result = await serialize_exam(session, exam_id, school_id, subject_codes if subject_codes else None)
        return SerializationResponse.model_validate(result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Serialization failed: {str(e)}")


@router.post("/{exam_id}/generate-score-sheets", response_model=ScoreSheetGenerationResponse, status_code=status.HTTP_200_OK)
async def generate_exam_score_sheets(
    exam_id: int,
    session: DBSessionDep,
    school_id: int | None = Query(None, description="Optional school ID to generate sheets only for that school"),
    subject_id: int | None = Query(None, description="Optional subject ID to generate sheets only for that subject"),
    test_types: list[int] = Query(default=[1, 2], description="List of test types to generate (1 = Objectives, 2 = Essay). Default: [1, 2]"),
) -> ScoreSheetGenerationResponse:
    """
    Generate score sheets for an exam and assign sheet IDs to candidates.

    For every school and subject combination:
    - For every series group, candidates are sorted by index number
    - Candidates are organized into batches of 25 per sheet
    - Each sheet gets a unique 13-character ID: SCHOOL_CODE(6) + SUBJECT_CODE(3) + SERIES(1) + TEST_TYPE(1) + SHEET_NUMBER(2)
    - Sheet IDs are assigned to SubjectScore records (obj_document_id for test_type=1, essay_document_id for test_type=2)

    Example: If a school has 200 candidates and mathematics has been serialized into 4 series,
    there will be 50 candidates per series, meaning each series will take about 2 pages (sheets).

    This operation will overwrite existing sheet ID assignments.
    """
    try:
        result = await generate_score_sheets(session, exam_id, school_id, subject_id, test_types)
        return ScoreSheetGenerationResponse.model_validate(result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Score sheet generation failed: {str(e)}")


@router.post("/{exam_id}/generate-pdf-score-sheets", response_model=PdfGenerationResponse, status_code=status.HTTP_200_OK)
async def generate_exam_pdf_score_sheets(
    exam_id: int,
    session: DBSessionDep,
    school_id: int | None = Query(None, description="Optional school ID to generate PDFs only for that school"),
    subject_id: int | None = Query(None, description="Optional subject ID to generate PDFs only for that subject"),
    test_types: list[int] = Query(default=[1, 2], description="List of test types to generate (1 = Objectives, 2 = Essay). Default: [1, 2]"),
) -> PdfGenerationResponse:
    """
    Generate PDF score sheets for an exam and assign sheet IDs to candidates.

    For every school and subject combination:
    - For every series group, candidates are sorted by index number
    - Generate ONE multi-page PDF with all candidates (template auto-paginates, max 25 per page)
    - Count pages in the generated PDF
    - Split candidates into batches of 25 (matching pages)
    - Generate sheet IDs based on page count: SCHOOL_CODE(6) + SUBJECT_CODE(3) + SERIES(1) + TEST_TYPE(1) + SHEET_NUMBER(2)
    - Annotate each page of PDF with its sheet ID (barcode + text)
    - Assign sheet IDs to SubjectScore records (obj_document_id for test_type=1, essay_document_id for test_type=2)

    Example: If a school has 200 candidates and mathematics has been serialized into 4 series,
    there will be 50 candidates per series, meaning each series will generate a 2-page PDF.

    This operation will overwrite existing sheet ID assignments.
    """
    try:
        result = await generate_pdfs_for_exam(session, exam_id, school_id, subject_id, test_types)
        return PdfGenerationResponse.model_validate(result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF generation failed: {str(e)}")


@router.get("/{exam_id}/schools")
async def get_exam_schools(
    exam_id: int,
    session: DBSessionDep,
) -> list[dict[str, Any]]:
    """
    Get list of schools that have candidates registered for the exam.

    Returns schools with their ID, code, and name.
    """
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Get unique schools through exam registrations
    schools_stmt = (
        select(School)
        .join(Candidate, Candidate.school_id == School.id)
        .join(ExamRegistration, ExamRegistration.candidate_id == Candidate.id)
        .where(ExamRegistration.exam_id == exam_id)
        .distinct()
        .order_by(School.name)
    )

    schools_result = await session.execute(schools_stmt)
    schools = schools_result.scalars().all()

    return [
        {
            "id": school.id,
            "code": school.code,
            "name": school.name,
        }
        for school in schools
    ]


@router.get("/{exam_id}/schools/{school_id}/subjects")
async def get_exam_school_subjects(
    exam_id: int,
    school_id: int,
    session: DBSessionDep,
) -> list[dict[str, Any]]:
    """
    Get list of subjects that a school has candidates registered for in an exam.

    Returns subjects with their ID, code, name, and subject_type.
    """
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Validate school exists
    school_stmt = select(School).where(School.id == school_id)
    school_result = await session.execute(school_stmt)
    school = school_result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get unique subjects through subject registrations
    # Join: SubjectRegistration -> ExamRegistration -> Candidate -> School
    # Also join with ExamSubject and Subject to get subject details
    subjects_stmt = (
        select(Subject)
        .join(ExamSubject, ExamSubject.subject_id == Subject.id)
        .join(SubjectRegistration, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .where(ExamSubject.exam_id == exam_id)
        .where(ExamRegistration.exam_id == exam_id)
        .where(Candidate.school_id == school_id)
        .distinct()
        .order_by(Subject.code)
    )

    subjects_result = await session.execute(subjects_stmt)
    subjects = subjects_result.scalars().all()

    return [
        {
            "id": subject.id,
            "code": subject.code,
            "name": subject.name,
            "original_code": subject.original_code,
            "subject_type": subject.subject_type.value if hasattr(subject.subject_type, 'value') else str(subject.subject_type),
            "exam_type": exam.exam_type.value if hasattr(exam.exam_type, 'value') else str(exam.exam_type),
        }
        for subject in subjects
    ]


@router.post("/{exam_id}/generate-pdf-score-sheets-combined", status_code=status.HTTP_200_OK)
async def generate_exam_pdf_score_sheets_combined(
    exam_id: int,
    session: DBSessionDep,
    school_id: int = Query(..., description="School ID to generate PDFs for (required)"),
    subject_id: int | None = Query(None, description="Optional subject ID to generate PDFs only for that subject"),
    test_types: list[int] = Query(default=[1, 2], description="List of test types to generate (1 = Objectives, 2 = Essay). Default: [1, 2]"),
) -> StreamingResponse:
    """
    Generate PDF score sheets for a specific school and combine all PDFs into one downloadable file.

    This endpoint:
    1. Generates PDFs for the specified school (and optionally subject/test types)
    2. Combines all generated PDFs for that school into a single PDF
    3. Returns the combined PDF as a downloadable file

    The combined PDF includes all subjects, series, and test types for the school,
    sorted by: subject_code, series, test_type.
    """
    try:
        # Validate school exists
        school_stmt = select(School).where(School.id == school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if not school:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"School with id {school_id} not found")

        # Generate PDFs for the school
        result = await generate_pdfs_for_exam(session, exam_id, school_id, subject_id, test_types)

        # Get the school directory path
        school_name_safe = school.name.replace("/", " ").replace("\\", " ")
        school_dir = Path(settings.pdf_output_path) / school_name_safe

        # Combine all PDFs for this school
        try:
            combined_pdf_bytes = combine_pdfs_for_school(school_dir)
        except ValueError as e:
            # If no PDFs found or combination fails, return error
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to combine PDFs: {str(e)}"
            )

        # Generate filename
        filename = f"{school.code}_{school.name.replace('/', '_').replace('\\', '_')}_combined_score_sheets.pdf"

        # Return as downloadable file
        return StreamingResponse(
            iter([combined_pdf_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF generation failed: {str(e)}")


# PDF Generation Job Endpoints

@router.post("/{exam_id}/generate-pdf-score-sheets-job", response_model=PdfGenerationJobResponse, status_code=status.HTTP_201_CREATED)
async def create_pdf_generation_job(
    exam_id: int,
    job_data: PdfGenerationJobCreate,
    session: DBSessionDep,
) -> PdfGenerationJobResponse:
    """
    Create a PDF generation job and start processing in the background.

    Returns job_id immediately. The job will be processed asynchronously.
    """
    from app.models import PdfGenerationJob, PdfGenerationJobStatus

    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Validate test types
    if not job_data.test_types or len(job_data.test_types) == 0:
        # Default to both test types if none provided
        job_data.test_types = [1, 2]

    for test_type in job_data.test_types:
        if test_type not in [1, 2]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Test type must be 1 or 2, got {test_type}")

    # Create job
    job = PdfGenerationJob(
        status=PdfGenerationJobStatus.PENDING,
        exam_id=exam_id,
        school_ids=job_data.school_ids,
        subject_id=job_data.subject_id,
        test_types=job_data.test_types,
        progress_current=0,
        progress_total=0,
    )

    session.add(job)
    await session.commit()
    await session.refresh(job)

    # Start background task
    start_pdf_generation_job(job.id)

    # Convert results if present
    results = None
    if job.results:
        from app.schemas.exam import PdfGenerationJobResult
        results = [PdfGenerationJobResult(**r) for r in job.results]

    return PdfGenerationJobResponse(
        id=job.id,
        status=job.status.value,
        exam_id=job.exam_id,
        school_ids=job.school_ids,
        subject_id=job.subject_id,
        test_types=job.test_types,
        progress_current=job.progress_current,
        progress_total=job.progress_total,
        current_school_name=job.current_school_name,
        error_message=job.error_message,
        results=results,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )
