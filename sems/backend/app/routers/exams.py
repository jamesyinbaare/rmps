from datetime import datetime
from typing import Any
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.dependencies.database import DBSessionDep
from app.models import (
    Candidate,
    DataExtractionMethod,
    Document,
    Exam,
    ExamRegistration,
    ExamSeries,
    ExamSubject,
    ExamType,
    ProcessStatus,
    ProcessTracking,
    ProcessType,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectScoreValidationIssue,
    SubjectType,
    UnmatchedExtractionRecord,
    UnmatchedRecordStatus,
    ValidationIssueStatus,
)
from app.schemas.exam import (
    ExamCreate,
    ExamListResponse,
    ExamProgressResponse,
    ExamResponse,
    ExamSubjectBulkUploadResponse,
    ExamSubjectBulkUploadError,
    ExamSubjectCreate,
    ExamSubjectResponse,
    ExamSubjectUpdate,
    ExamUpdate,
    PdfGenerationJobCreate,
    PdfGenerationJobResponse,
    PdfGenerationResponse,
    PreparationsProgress,
    RegistrationProgress,
    SerializationProgress,
    IcmPdfGenerationProgress,
    ResultsProcessingOverallProgress,
    ScoreInterpretationProgress,
    DocumentProcessingProgress,
    ScoringDataEntryProgress,
    ValidationIssuesProgress,
    ResultsProcessingProgress,
    ResultsReleaseProgress,
    GradeRangesProgress,
    ScoreSheetGenerationResponse,
    SerializationResponse,
)
from app.services.score_sheet_generator import generate_score_sheets
from app.services.score_sheet_pdf_service import combine_pdfs_for_school, generate_pdfs_for_exam
from app.services.serialization import serialize_exam
from app.services.template_generator import generate_exam_subject_template
from app.services.scannables_export import generate_core_subjects_export, generate_electives_export
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


def compute_default_subjects_to_serialize(subjects: list[Subject]) -> list[str]:
    """
    Compute default subject codes to serialize: CORE subjects + specific default codes.

    Args:
        subjects: List of Subject objects

    Returns:
        List of subject codes to serialize by default
    """
    # Default subject codes (same as frontend)
    DEFAULT_SERIALIZE_CODES = ["301", "302", "421", "422", "461", "462", "471", "472", "601", "602", "621", "622", "701", "702", "703", "704", "705"]

    # Get CORE subject codes
    core_codes = [s.code for s in subjects if s.subject_type == SubjectType.CORE]

    # Combine CORE + default codes, remove duplicates, and return
    all_codes = list(set(core_codes + DEFAULT_SERIALIZE_CODES))
    return sorted(all_codes)


@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(exam_id: int, session: DBSessionDep) -> ExamResponse:
    """Get exam details."""
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # If subjects_to_serialize is not set, compute defaults from exam subjects
    if not exam.subjects_to_serialize:
        # Load exam subjects with subject relationship
        exam_subjects_stmt = (
            select(ExamSubject, Subject)
            .join(Subject, ExamSubject.subject_id == Subject.id)
            .where(ExamSubject.exam_id == exam_id)
        )
        exam_subjects_result = await session.execute(exam_subjects_stmt)
        exam_subjects_data = exam_subjects_result.all()

        if exam_subjects_data:
            # Extract Subject objects
            subjects = [subject for _, subject in exam_subjects_data]
            # Compute defaults: CORE subjects + specific codes
            default_codes = compute_default_subjects_to_serialize(subjects)
            # Note: We don't save this to the database automatically, just return it in the response
            # The frontend will use this as defaults
            exam_dict = ExamResponse.model_validate(exam).model_dump()
            exam_dict["subjects_to_serialize"] = default_codes
            return ExamResponse.model_validate(exam_dict)

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
    if exam_update.subjects_to_serialize is not None:
        exam.subjects_to_serialize = exam_update.subjects_to_serialize

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
            original_code=subject.original_code,
            subject_name=subject.name,
            subject_type=subject.subject_type,
            obj_pct=exam_subject.obj_pct,
            essay_pct=exam_subject.essay_pct,
            pract_pct=exam_subject.pract_pct,
            obj_max_score=exam_subject.obj_max_score,
            essay_max_score=exam_subject.essay_max_score,
            pract_max_score=exam_subject.pract_max_score,
            grade_ranges_json=exam_subject.grade_ranges_json,
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


@router.get("/{exam_id}/progress", response_model=ExamProgressResponse)
async def get_exam_progress(exam_id: int, session: DBSessionDep) -> ExamProgressResponse:
    """Get comprehensive progress data for an exam across all lifecycle stages using ProcessTracking."""
    # Get exam
    stmt = select(Exam).where(Exam.id == exam_id)
    result = await session.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # ========== PREPARATIONS PHASE ==========
    # 1. Registration
    candidates_stmt = select(func.count(ExamRegistration.id)).where(ExamRegistration.exam_id == exam_id)
    candidates_result = await session.execute(candidates_stmt)
    total_candidates = candidates_result.scalar() or 0

    registration_completion = 100.0 if total_candidates > 0 else 0.0
    registration_status = "complete" if total_candidates > 0 else "pending"

    registration = RegistrationProgress(
        total_candidates=total_candidates,
        completion_percentage=registration_completion,
        status=registration_status,
    )

    # 2. Serialization - Query ProcessTracking
    serialization_tracking_stmt = (
        select(ProcessTracking)
        .where(ProcessTracking.exam_id == exam_id, ProcessTracking.process_type == ProcessType.SERIALIZATION)
        .order_by(ProcessTracking.completed_at.desc())
    )
    serialization_tracking_result = await session.execute(serialization_tracking_stmt)
    serialization_tracking = serialization_tracking_result.scalars().first()

    # Count candidates with serialization
    serialized_candidates_stmt = (
        select(func.count(func.distinct(SubjectRegistration.exam_registration_id)))
        .select_from(SubjectRegistration)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(ExamRegistration.exam_id == exam_id, SubjectRegistration.series.isnot(None))
    )
    serialized_candidates_result = await session.execute(serialized_candidates_stmt)
    candidates_serialized = serialized_candidates_result.scalar() or 0

    # Count total schools
    schools_stmt = (
        select(func.count(func.distinct(Candidate.school_id)))
        .select_from(Candidate)
        .join(ExamRegistration, Candidate.id == ExamRegistration.candidate_id)
        .where(ExamRegistration.exam_id == exam_id)
    )
    schools_result = await session.execute(schools_stmt)
    total_schools = schools_result.scalar() or 0

    # Count schools with serialization (from ProcessTracking metadata)
    schools_serialized = 0
    schools_detail = []
    subjects_detail = []
    last_serialized_at = None

    if serialization_tracking and serialization_tracking.process_metadata:
        meta = serialization_tracking.process_metadata
        schools_serialized = len(meta.get("schools_processed", []))
        schools_detail = meta.get("schools_processed", [])
        subjects_detail = meta.get("subjects_processed", [])
        if serialization_tracking.completed_at:
            last_serialized_at = serialization_tracking.completed_at.isoformat()

    serialization_completion = (candidates_serialized / total_candidates * 100.0) if total_candidates > 0 else 0.0
    serialization_status = "complete" if serialization_completion == 100.0 and total_candidates > 0 else ("in_progress" if serialization_completion > 0 else "pending")

    serialization = SerializationProgress(
        total_candidates=total_candidates,
        candidates_serialized=candidates_serialized,
        total_schools=total_schools,
        schools_serialized=schools_serialized,
        completion_percentage=round(serialization_completion, 2),
        status=serialization_status,
        last_serialized_at=last_serialized_at,
        schools_detail=schools_detail,
        subjects_detail=subjects_detail,
    )

    # 3. ICM/PDF Generation - Query ProcessTracking
    score_sheet_tracking_stmt = (
        select(ProcessTracking)
        .where(
            ProcessTracking.exam_id == exam_id,
            ProcessTracking.process_type == ProcessType.SCORE_SHEET_GENERATION,
            ProcessTracking.status == ProcessStatus.COMPLETED,
        )
    )
    score_sheet_result = await session.execute(score_sheet_tracking_stmt)
    score_sheet_trackings = score_sheet_result.scalars().all()

    pdf_tracking_stmt = (
        select(ProcessTracking)
        .where(
            ProcessTracking.exam_id == exam_id,
            ProcessTracking.process_type == ProcessType.PDF_GENERATION,
            ProcessTracking.status == ProcessStatus.COMPLETED,
        )
    )
    pdf_result = await session.execute(pdf_tracking_stmt)
    pdf_trackings = pdf_result.scalars().all()

    excel_tracking_stmt = (
        select(ProcessTracking)
        .where(
            ProcessTracking.exam_id == exam_id,
            ProcessTracking.process_type.in_([ProcessType.EXCEL_EXPORT_CORE, ProcessType.EXCEL_EXPORT_ELECTIVES]),
            ProcessTracking.status == ProcessStatus.COMPLETED,
        )
    )
    excel_result = await session.execute(excel_tracking_stmt)
    excel_trackings = excel_result.scalars().all()

    # Aggregate school/subject data from tracking
    schools_with_sheets = set()
    subjects_with_sheets = set()
    total_score_sheets = 0
    total_pdfs = 0

    schools_detail_gen: dict[int, dict[str, Any]] = {}
    subjects_detail_gen: dict[int, dict[str, Any]] = {}

    for tracking in score_sheet_trackings:
        if tracking.school_id:
            schools_with_sheets.add(tracking.school_id)
        if tracking.subject_id:
            subjects_with_sheets.add(tracking.subject_id)
        if tracking.process_metadata:
            total_score_sheets += tracking.process_metadata.get("sheets_generated", 0)
            if tracking.school_id:
                if tracking.school_id not in schools_detail_gen:
                    schools_detail_gen[tracking.school_id] = {"school_id": tracking.school_id, "sheets_count": 0, "pdfs_count": 0}
                schools_detail_gen[tracking.school_id]["sheets_count"] += tracking.process_metadata.get("sheets_generated", 0)
            if tracking.subject_id:
                if tracking.subject_id not in subjects_detail_gen:
                    subjects_detail_gen[tracking.subject_id] = {"subject_id": tracking.subject_id, "sheets_count": 0, "pdfs_count": 0}
                subjects_detail_gen[tracking.subject_id]["sheets_count"] += tracking.process_metadata.get("sheets_generated", 0)

    for tracking in pdf_trackings:
        if tracking.school_id:
            schools_with_sheets.add(tracking.school_id)
        if tracking.subject_id:
            subjects_with_sheets.add(tracking.subject_id)
        if tracking.process_metadata:
            total_pdfs += 1
            if tracking.school_id:
                if tracking.school_id not in schools_detail_gen:
                    schools_detail_gen[tracking.school_id] = {"school_id": tracking.school_id, "sheets_count": 0, "pdfs_count": 0}
                schools_detail_gen[tracking.school_id]["pdfs_count"] += 1
            if tracking.subject_id:
                if tracking.subject_id not in subjects_detail_gen:
                    subjects_detail_gen[tracking.subject_id] = {"subject_id": tracking.subject_id, "sheets_count": 0, "pdfs_count": 0}
                subjects_detail_gen[tracking.subject_id]["pdfs_count"] += 1

    # Get school and subject names for detail
    for school_id in schools_detail_gen:
        school_stmt = select(School).where(School.id == school_id)
        school_res = await session.execute(school_stmt)
        school = school_res.scalar_one_or_none()
        if school:
            schools_detail_gen[school_id]["school_name"] = school.name

    for subject_id in subjects_detail_gen:
        subject_stmt = select(Subject).where(Subject.id == subject_id)
        subject_res = await session.execute(subject_stmt)
        subject = subject_res.scalar_one_or_none()
        if subject:
            subjects_detail_gen[subject_id]["subject_code"] = subject.code
            subjects_detail_gen[subject_id]["subject_name"] = subject.name

    # Count total subjects
    subjects_stmt = select(func.count(ExamSubject.id)).where(ExamSubject.exam_id == exam_id)
    subjects_result = await session.execute(subjects_stmt)
    total_subjects = subjects_result.scalar() or 0

    # Excel exports
    excel_exports = []
    for tracking in excel_trackings:
        if tracking.process_metadata:
            excel_exports.append({
                "process_type": tracking.process_type.value,
                "file_path": tracking.process_metadata.get("file_path"),
                "file_name": tracking.process_metadata.get("file_name"),
                "file_size": tracking.process_metadata.get("file_size"),
                "generated_at": tracking.completed_at.isoformat() if tracking.completed_at else None,
            })

    icm_pdf_completion = 0.0
    if total_schools > 0 and total_subjects > 0:
        school_progress = (len(schools_with_sheets) / total_schools) * 50.0
        subject_progress = (len(subjects_with_sheets) / total_subjects) * 50.0
        icm_pdf_completion = school_progress + subject_progress
    icm_pdf_status = "complete" if icm_pdf_completion == 100.0 else ("in_progress" if icm_pdf_completion > 0 else "pending")

    icm_pdf_generation = IcmPdfGenerationProgress(
        total_schools=total_schools,
        schools_with_sheets=len(schools_with_sheets),
        total_subjects=total_subjects,
        subjects_with_sheets=len(subjects_with_sheets),
        score_sheets_generated=total_score_sheets,
        pdfs_generated=total_pdfs,
        excel_exports_generated=len(excel_trackings),
        completion_percentage=round(icm_pdf_completion, 2),
        status=icm_pdf_status,
        schools_detail=list(schools_detail_gen.values()),
        subjects_detail=list(subjects_detail_gen.values()),
        excel_exports=excel_exports,
    )

    # Overall preparations completion
    prep_completion = (registration_completion + serialization_completion + icm_pdf_completion) / 3.0
    prep_status = "complete" if prep_completion == 100.0 else ("in_progress" if prep_completion > 0 else "pending")

    preparations = PreparationsProgress(
        registration=registration,
        serialization=serialization,
        icm_pdf_generation=icm_pdf_generation,
        overall_completion_percentage=round(prep_completion, 2),
        status=prep_status,
    )

    # ========== RESULTS PROCESSING PHASE ==========
    # 1. Score Interpretation (setting max scores, percentages)
    subjects_stmt = select(func.count(ExamSubject.id)).where(ExamSubject.exam_id == exam_id)
    subjects_result = await session.execute(subjects_stmt)
    total_subjects = subjects_result.scalar() or 0

    # Count subjects with percentages and max scores configured
    configured_subjects_stmt = (
        select(func.count(ExamSubject.id))
        .where(
            ExamSubject.exam_id == exam_id,
            ExamSubject.obj_pct.isnot(None),
            ExamSubject.essay_pct.isnot(None),
            ExamSubject.obj_max_score.isnot(None),
            ExamSubject.essay_max_score.isnot(None),
        )
    )
    configured_subjects_result = await session.execute(configured_subjects_stmt)
    subjects_configured = configured_subjects_result.scalar() or 0

    # Count subjects with grade ranges
    grade_ranges_stmt = (
        select(func.count(ExamSubject.id))
        .where(ExamSubject.exam_id == exam_id, ExamSubject.grade_ranges_json.isnot(None))
    )
    grade_ranges_result = await session.execute(grade_ranges_stmt)
    subjects_with_grade_ranges = grade_ranges_result.scalar() or 0

    score_interpretation_completion = (subjects_configured / total_subjects * 100.0) if total_subjects > 0 else 0.0
    score_interpretation_status = "complete" if score_interpretation_completion == 100.0 else ("in_progress" if score_interpretation_completion > 0 else "pending")

    score_interpretation = ScoreInterpretationProgress(
        total_subjects=total_subjects,
        subjects_configured=subjects_configured,
        subjects_with_grade_ranges=subjects_with_grade_ranges,
        completion_percentage=round(score_interpretation_completion, 2),
        status=score_interpretation_status,
    )

    # 2. Document Processing
    # Count total documents
    docs_stmt = select(func.count(Document.id)).where(Document.exam_id == exam_id)
    docs_result = await session.execute(docs_stmt)
    total_documents = docs_result.scalar() or 0

    # Count documents by ID extraction status
    id_success_stmt = (
        select(func.count(Document.id))
        .where(Document.exam_id == exam_id, Document.id_extraction_status == "success")
    )
    id_success_result = await session.execute(id_success_stmt)
    documents_id_extracted_success = id_success_result.scalar() or 0

    id_error_stmt = (
        select(func.count(Document.id))
        .where(Document.exam_id == exam_id, Document.id_extraction_status == "error")
    )
    id_error_result = await session.execute(id_error_stmt)
    documents_id_extracted_error = id_error_result.scalar() or 0

    id_pending_stmt = (
        select(func.count(Document.id))
        .where(Document.exam_id == exam_id, Document.id_extraction_status == "pending")
    )
    id_pending_result = await session.execute(id_pending_stmt)
    documents_id_extracted_pending = id_pending_result.scalar() or 0

    # Count documents by scores extraction status
    scores_success_stmt = (
        select(func.count(Document.id))
        .where(Document.exam_id == exam_id, Document.scores_extraction_status == "success")
    )
    scores_success_result = await session.execute(scores_success_stmt)
    documents_scores_extracted_success = scores_success_result.scalar() or 0

    scores_error_stmt = (
        select(func.count(Document.id))
        .where(Document.exam_id == exam_id, Document.scores_extraction_status == "error")
    )
    scores_error_result = await session.execute(scores_error_stmt)
    documents_scores_extracted_error = scores_error_result.scalar() or 0

    scores_pending_stmt = (
        select(func.count(Document.id))
        .where(Document.exam_id == exam_id, Document.scores_extraction_status == "pending")
    )
    scores_pending_result = await session.execute(scores_pending_stmt)
    documents_scores_extracted_pending = scores_pending_result.scalar() or 0

    # Calculate document processing completion
    id_completion = 0.0
    scores_completion = 0.0
    if total_documents > 0:
        id_completion = ((documents_id_extracted_success + documents_id_extracted_error) / total_documents) * 100.0
        scores_completion = ((documents_scores_extracted_success + documents_scores_extracted_error) / total_documents) * 100.0
    overall_doc_completion = (id_completion + scores_completion) / 2.0 if total_documents > 0 else 0.0
    doc_status = "complete" if overall_doc_completion == 100.0 else ("in_progress" if overall_doc_completion > 0 else "pending")

    document_processing = DocumentProcessingProgress(
        total_documents=total_documents,
        documents_id_extracted_success=documents_id_extracted_success,
        documents_id_extracted_error=documents_id_extracted_error,
        documents_id_extracted_pending=documents_id_extracted_pending,
        documents_scores_extracted_success=documents_scores_extracted_success,
        documents_scores_extracted_error=documents_scores_extracted_error,
        documents_scores_extracted_pending=documents_scores_extracted_pending,
        id_extraction_completion_percentage=round(id_completion, 2),
        scores_extraction_completion_percentage=round(scores_completion, 2),
        overall_completion_percentage=round(overall_doc_completion, 2),
        status=doc_status,
    )

    # 3. Scoring/Data Entry
    # Calculate expected vs actual score entries based on max_scores set per subject
    # Get all subject registrations with their exam subjects to check max_scores
    regs_with_subjects_stmt = (
        select(SubjectRegistration, ExamSubject)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(ExamSubject, SubjectRegistration.exam_subject_id == ExamSubject.id)
        .where(ExamRegistration.exam_id == exam_id)
    )
    regs_with_subjects_result = await session.execute(regs_with_subjects_stmt)
    regs_with_subjects = regs_with_subjects_result.all()

    total_subject_registrations = len(regs_with_subjects)
    total_expected_score_entries = 0
    total_actual_score_entries = 0

    # For each registration, count expected and actual entries
    for subject_reg, exam_subject in regs_with_subjects:
        # Count expected entries based on max_scores set
        expected_count = 0
        obj_expected = exam_subject.obj_max_score is not None
        essay_expected = exam_subject.essay_max_score is not None
        pract_expected = exam_subject.pract_max_score is not None

        if obj_expected:
            expected_count += 1
        if essay_expected:
            expected_count += 1
        if pract_expected:
            expected_count += 1

        total_expected_score_entries += expected_count

        # Get SubjectScore if it exists and count actual entries
        # Only count entries that correspond to expected test types
        score_stmt = select(SubjectScore).where(SubjectScore.subject_registration_id == subject_reg.id)
        score_result = await session.execute(score_stmt)
        subject_score = score_result.scalar_one_or_none()

        if subject_score:
            actual_count = 0
            # Only count if max_score is set for that test type and raw_score is not None/empty
            # Empty strings and whitespace-only strings are treated as not set
            if obj_expected:
                raw_score = subject_score.obj_raw_score
                if raw_score is not None and str(raw_score).strip():
                    actual_count += 1
            if essay_expected:
                raw_score = subject_score.essay_raw_score
                if raw_score is not None and str(raw_score).strip():
                    actual_count += 1
            if pract_expected:
                raw_score = subject_score.pract_raw_score
                if raw_score is not None and str(raw_score).strip():
                    actual_count += 1
            total_actual_score_entries += actual_count

    # Count registrations with at least one score (has SubjectScore record)
    scores_stmt = (
        select(func.count(SubjectScore.id))
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(ExamRegistration.exam_id == exam_id)
    )
    scores_result = await session.execute(scores_stmt)
    registrations_with_scores = scores_result.scalar() or 0

    # Count by extraction method
    manual_stmt = (
        select(func.count(func.distinct(SubjectScore.id)))
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(
            ExamRegistration.exam_id == exam_id,
            (
                (SubjectScore.obj_extraction_method == DataExtractionMethod.MANUAL_ENTRY_PHYSICAL)
                | (SubjectScore.essay_extraction_method == DataExtractionMethod.MANUAL_ENTRY_PHYSICAL)
                | (SubjectScore.pract_extraction_method == DataExtractionMethod.MANUAL_ENTRY_PHYSICAL)
            ),
        )
    )
    manual_result = await session.execute(manual_stmt)
    registrations_manual_entry = manual_result.scalar() or 0

    digital_stmt = (
        select(func.count(func.distinct(SubjectScore.id)))
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(
            ExamRegistration.exam_id == exam_id,
            (
                (SubjectScore.obj_extraction_method == DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL)
                | (SubjectScore.essay_extraction_method == DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL)
                | (SubjectScore.pract_extraction_method == DataExtractionMethod.MANUAL_TRANSCRIPTION_DIGITAL)
            ),
        )
    )
    digital_result = await session.execute(digital_stmt)
    registrations_digital_transcription = digital_result.scalar() or 0

    automated_stmt = (
        select(func.count(func.distinct(SubjectScore.id)))
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(
            ExamRegistration.exam_id == exam_id,
            (
                (SubjectScore.obj_extraction_method == DataExtractionMethod.AUTOMATED_EXTRACTION)
                | (SubjectScore.essay_extraction_method == DataExtractionMethod.AUTOMATED_EXTRACTION)
                | (SubjectScore.pract_extraction_method == DataExtractionMethod.AUTOMATED_EXTRACTION)
            ),
        )
    )
    automated_result = await session.execute(automated_stmt)
    registrations_automated_extraction = automated_result.scalar() or 0

    # Count unmatched records
    unmatched_stmt = (
        select(func.count(UnmatchedExtractionRecord.id))
        .select_from(UnmatchedExtractionRecord)
        .join(Document, UnmatchedExtractionRecord.document_id == Document.id)
        .where(Document.exam_id == exam_id)
    )
    unmatched_result = await session.execute(unmatched_stmt)
    unmatched_records_total = unmatched_result.scalar() or 0

    unmatched_pending_stmt = (
        select(func.count(UnmatchedExtractionRecord.id))
        .select_from(UnmatchedExtractionRecord)
        .join(Document, UnmatchedExtractionRecord.document_id == Document.id)
        .where(Document.exam_id == exam_id, UnmatchedExtractionRecord.status == UnmatchedRecordStatus.PENDING)
    )
    unmatched_pending_result = await session.execute(unmatched_pending_stmt)
    unmatched_records_pending = unmatched_pending_result.scalar() or 0

    unmatched_resolved_stmt = (
        select(func.count(UnmatchedExtractionRecord.id))
        .select_from(UnmatchedExtractionRecord)
        .join(Document, UnmatchedExtractionRecord.document_id == Document.id)
        .where(Document.exam_id == exam_id, UnmatchedExtractionRecord.status == UnmatchedRecordStatus.RESOLVED)
    )
    unmatched_resolved_result = await session.execute(unmatched_resolved_stmt)
    unmatched_records_resolved = unmatched_resolved_result.scalar() or 0

    # Count validation issues
    validation_stmt = (
        select(func.count(SubjectScoreValidationIssue.id))
        .select_from(SubjectScoreValidationIssue)
        .join(ExamSubject, SubjectScoreValidationIssue.exam_subject_id == ExamSubject.id)
        .where(ExamSubject.exam_id == exam_id)
    )
    validation_result = await session.execute(validation_stmt)
    validation_issues_total = validation_result.scalar() or 0

    validation_pending_stmt = (
        select(func.count(SubjectScoreValidationIssue.id))
        .select_from(SubjectScoreValidationIssue)
        .join(ExamSubject, SubjectScoreValidationIssue.exam_subject_id == ExamSubject.id)
        .where(ExamSubject.exam_id == exam_id, SubjectScoreValidationIssue.status == ValidationIssueStatus.PENDING)
    )
    validation_pending_result = await session.execute(validation_pending_stmt)
    validation_issues_pending = validation_pending_result.scalar() or 0

    validation_resolved_stmt = (
        select(func.count(SubjectScoreValidationIssue.id))
        .select_from(SubjectScoreValidationIssue)
        .join(ExamSubject, SubjectScoreValidationIssue.exam_subject_id == ExamSubject.id)
        .where(ExamSubject.exam_id == exam_id, SubjectScoreValidationIssue.status == ValidationIssueStatus.RESOLVED)
    )
    validation_resolved_result = await session.execute(validation_resolved_stmt)
    validation_issues_resolved = validation_resolved_result.scalar() or 0

    # Calculate score entry completion based on expected vs actual entries
    score_entry_completion = 0.0
    if total_expected_score_entries > 0:
        score_entry_completion = (total_actual_score_entries / total_expected_score_entries) * 100.0
    elif total_subject_registrations > 0:
        # If there are registrations but no expected entries (no max_scores set), show 0%
        score_entry_completion = 0.0
    # If no registrations at all, completion stays at 0.0

    score_entry_status = "complete" if score_entry_completion == 100.0 and unmatched_records_pending == 0 and validation_issues_pending == 0 else ("in_progress" if score_entry_completion > 0 else "pending")

    scoring_data_entry = ScoringDataEntryProgress(
        total_subject_registrations=total_subject_registrations,
        registrations_with_scores=registrations_with_scores,
        total_expected_score_entries=total_expected_score_entries,
        total_actual_score_entries=total_actual_score_entries,
        registrations_manual_entry=registrations_manual_entry,
        registrations_digital_transcription=registrations_digital_transcription,
        registrations_automated_extraction=registrations_automated_extraction,
        completion_percentage=round(score_entry_completion, 2),
        status=score_entry_status,
    )

    # 4. Validation Issues
    validation_completion = 0.0
    if validation_issues_total > 0:
        validation_completion = (validation_issues_resolved / validation_issues_total * 100.0) if unmatched_records_total == 0 else ((unmatched_records_resolved + validation_issues_resolved) / (unmatched_records_total + validation_issues_total) * 100.0)
    elif unmatched_records_total > 0:
        validation_completion = (unmatched_records_resolved / unmatched_records_total * 100.0)
    else:
        validation_completion = 100.0 if total_subject_registrations > 0 else 0.0

    validation_status = "complete" if validation_completion == 100.0 and unmatched_records_pending == 0 and validation_issues_pending == 0 else ("in_progress" if validation_completion > 0 else "pending")

    validation_issues = ValidationIssuesProgress(
        unmatched_records_total=unmatched_records_total,
        unmatched_records_pending=unmatched_records_pending,
        unmatched_records_resolved=unmatched_records_resolved,
        validation_issues_total=validation_issues_total,
        validation_issues_pending=validation_issues_pending,
        validation_issues_resolved=validation_issues_resolved,
        completion_percentage=round(validation_completion, 2),
        status=validation_status,
    )

    # 5. Results Processing (normalization, total scores)
    # Count processed registrations (has normalized scores and total_score > 0)
    processed_stmt = (
        select(func.count(SubjectScore.id))
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .where(
            ExamRegistration.exam_id == exam_id,
            SubjectScore.total_score > 0,
            SubjectScore.obj_normalized.isnot(None),
            SubjectScore.essay_normalized.isnot(None),
        )
    )
    processed_result = await session.execute(processed_stmt)
    registrations_processed = processed_result.scalar() or 0

    registrations_pending = total_subject_registrations - registrations_processed

    # Calculate result processing completion
    result_processing_completion = 0.0
    if total_subject_registrations > 0:
        result_processing_completion = (registrations_processed / total_subject_registrations) * 100.0
    result_processing_status = "complete" if result_processing_completion == 100.0 else ("in_progress" if result_processing_completion > 0 else "pending")

    results_processing = ResultsProcessingProgress(
        total_subject_registrations=total_subject_registrations,
        registrations_processed=registrations_processed,
        registrations_pending=registrations_pending,
        completion_percentage=round(result_processing_completion, 2),
        status=result_processing_status,
    )

    # Overall Results Processing completion
    results_processing_completion_overall = (
        score_interpretation_completion + overall_doc_completion + score_entry_completion + validation_completion + result_processing_completion
    ) / 5.0
    results_processing_status_overall = "complete" if results_processing_completion_overall == 100.0 else ("in_progress" if results_processing_completion_overall > 0 else "pending")

    results_processing_overall = ResultsProcessingOverallProgress(
        score_interpretation=score_interpretation,
        document_processing=document_processing,
        scoring_data_entry=scoring_data_entry,
        validation_issues=validation_issues,
        results_processing=results_processing,
        overall_completion_percentage=round(results_processing_completion_overall, 2),
        status=results_processing_status_overall,
    )

    # ========== RESULTS RELEASE PHASE ==========
    # Grade Ranges Setup
    grade_ranges_completion = (subjects_with_grade_ranges / total_subjects * 100.0) if total_subjects > 0 else 0.0
    grade_ranges_status = "complete" if grade_ranges_completion == 100.0 else ("in_progress" if grade_ranges_completion > 0 else "pending")

    grade_ranges = GradeRangesProgress(
        total_subjects=total_subjects,
        subjects_with_grade_ranges=subjects_with_grade_ranges,
        completion_percentage=round(grade_ranges_completion, 2),
        status=grade_ranges_status,
    )

    # Overall Results Release completion
    results_release_completion = grade_ranges_completion
    results_release_status = grade_ranges_status

    results_release = ResultsReleaseProgress(
        grade_ranges=grade_ranges,
        overall_completion_percentage=round(results_release_completion, 2),
        status=results_release_status,
    )

    # ========== OVERALL PROGRESS ==========
    overall_completion = (
        prep_completion + results_processing_completion_overall + results_release_completion
    ) / 3.0
    overall_status = "complete" if overall_completion == 100.0 else ("in_progress" if overall_completion > 0 else "pending")

    return ExamProgressResponse(
        exam_id=exam.id,
        exam_type=exam.exam_type.value if hasattr(exam.exam_type, 'value') else str(exam.exam_type),
        exam_year=exam.year,
        exam_series=exam.series.value if hasattr(exam.series, 'value') else str(exam.series),
        preparations=preparations,
        results_processing=results_processing_overall,
        results_release=results_release,
        overall_completion_percentage=round(overall_completion, 2),
        overall_status=overall_status,
    )


@router.post("/{exam_id}/serialize", response_model=SerializationResponse, status_code=status.HTTP_200_OK)
async def serialize_exam_candidates(
    exam_id: int,
    session: DBSessionDep,
    school_id: int | None = Query(None, description="Optional school ID to serialize only that school"),
    subject_codes: list[str] | None = Query(None, description="List of subject codes to serialize. Subjects not in this list will be assigned default series 1. If not provided, uses exam.subjects_to_serialize if available."),
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
        # If subject_codes not provided, try to use exam.subjects_to_serialize
        codes_to_use = subject_codes
        if codes_to_use is None:
            exam_stmt = select(Exam).where(Exam.id == exam_id)
            exam_result = await session.execute(exam_stmt)
            exam = exam_result.scalar_one_or_none()
            if exam and exam.subjects_to_serialize:
                codes_to_use = exam.subjects_to_serialize

        result = await serialize_exam(session, exam_id, school_id, codes_to_use)
        return SerializationResponse.model_validate(result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Serialization failed: {str(e)}")


@router.get("/{exam_id}/export/scannables/core")
async def export_scannables_core(
    exam_id: int,
    session: DBSessionDep,
) -> StreamingResponse:
    """Export scannables data for core subjects as Excel file."""
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        excel_bytes = await generate_core_subjects_export(session, exam_id)
        filename = f"exam_{exam_id}_scannables_core.xlsx"

        # Save file to disk for tracking
        excel_export_dir = Path(settings.storage_path) / "excel_exports"
        excel_export_dir.mkdir(parents=True, exist_ok=True)
        file_path = excel_export_dir / filename
        file_path.write_bytes(excel_bytes)

        # Create ProcessTracking record
        tracking = ProcessTracking(
            exam_id=exam_id,
            process_type=ProcessType.EXCEL_EXPORT_CORE,
            school_id=None,
            subject_id=None,
            status=ProcessStatus.COMPLETED,
            process_metadata={
                "file_path": str(file_path),
                "file_name": filename,
                "file_size": len(excel_bytes),
            },
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        session.add(tracking)
        await session.commit()

        return StreamingResponse(
            iter([excel_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate core subjects export: {str(e)}",
        )


@router.get("/{exam_id}/export/scannables/electives")
async def export_scannables_electives(
    exam_id: int,
    session: DBSessionDep,
) -> StreamingResponse:
    """Export scannables data for electives as Excel file with multiple sheets (one per programme)."""
    # Validate exam exists
    exam_stmt = select(Exam).where(Exam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    try:
        excel_bytes = await generate_electives_export(session, exam_id)
        filename = f"exam_{exam_id}_scannables_electives.xlsx"

        # Save file to disk for tracking
        excel_export_dir = Path(settings.storage_path) / "excel_exports"
        excel_export_dir.mkdir(parents=True, exist_ok=True)
        file_path = excel_export_dir / filename
        file_path.write_bytes(excel_bytes)

        # Create ProcessTracking record
        tracking = ProcessTracking(
            exam_id=exam_id,
            process_type=ProcessType.EXCEL_EXPORT_ELECTIVES,
            school_id=None,
            subject_id=None,
            status=ProcessStatus.COMPLETED,
            process_metadata={
                "file_path": str(file_path),
                "file_name": filename,
                "file_size": len(excel_bytes),
            },
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        session.add(tracking)
        await session.commit()

        return StreamingResponse(
            iter([excel_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate electives export: {str(e)}",
        )


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
        school_name_safe = school.name.replace("/", "_").replace("\\", "_")
        filename = f"{school.code}_{school_name_safe}_combined_score_sheets.pdf"

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
