from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError

from app.dependencies.database import DBSessionDep
from app.models import Document, Programme, ProgrammeType, School, Subject, SubjectType, programme_subjects, school_programmes
from app.schemas.subject import (
    SubjectBulkUploadError,
    SubjectBulkUploadResponse,
    SubjectCreate,
    SubjectResponse,
    SubjectStatistics,
    SubjectUpdate,
)
from app.services.subject_upload import (
    SubjectUploadParseError,
    SubjectUploadValidationError,
    parse_subject_row,
    parse_upload_file,
    validate_required_columns,
)
from app.services.template_generator import generate_subject_template

router = APIRouter(prefix="/api/v1/subjects", tags=["subjects"])


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(subject: SubjectCreate, session: DBSessionDep) -> SubjectResponse:
    """Create a new subject."""
    # Validate code length based on programme_type
    # If programme_type is CERT2 or None, code must be exactly 3 characters
    # If programme_type is NVTI, code can be 1-10 characters (saved as-is)
    programme_type = subject.programme_type or ProgrammeType.CERT2
    if programme_type == ProgrammeType.CERT2:
        if len(subject.code) != 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code must be exactly 3 characters for CERT2 programme type",
            )
    elif programme_type == ProgrammeType.NVTI:
        if len(subject.code) < 1 or len(subject.code) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code must be between 1 and 10 characters for NVTI programme type",
            )
    # else: programme_type is None, treat as CERT2 (already handled above)

    # Check if code already exists
    stmt = select(Subject).where(Subject.code == subject.code)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Subject with code {subject.code} already exists"
        )

    # Check if original_code already exists
    original_code_stmt = select(Subject).where(Subject.original_code == subject.original_code)
    original_code_result = await session.execute(original_code_stmt)
    existing_original = original_code_result.scalar_one_or_none()
    if existing_original:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject with original_code {subject.original_code} already exists",
        )

    db_subject = Subject(
        code=subject.code,
        original_code=subject.original_code,
        name=subject.name,
        subject_type=subject.subject_type,
        exam_type=subject.exam_type,
        programme_type=subject.programme_type,
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


@router.get("/template")
async def download_subject_template() -> StreamingResponse:
    """Download Excel template for subject upload."""
    try:
        template_bytes = generate_subject_template()
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename=subject_upload_template.xlsx'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


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
    if subject_update.original_code is not None:
        # Check if original_code already exists (excluding current subject)
        original_code_stmt = select(Subject).where(
            Subject.original_code == subject_update.original_code, Subject.id != subject_id
        )
        original_code_result = await session.execute(original_code_stmt)
        existing_original = original_code_result.scalar_one_or_none()
        if existing_original:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject with original_code {subject_update.original_code} already exists",
            )
        subject.original_code = subject_update.original_code
    if subject_update.subject_type is not None:
        subject.subject_type = subject_update.subject_type
    if subject_update.exam_type is not None:
        subject.exam_type = subject_update.exam_type
    if subject_update.programme_type is not None:
        subject.programme_type = subject_update.programme_type

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

    try:
        await session.delete(subject)
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        error_str = str(e.orig) if hasattr(e, 'orig') else str(e)
        # Check if it's a foreign key constraint violation
        if "foreign key constraint" in error_str.lower() or "violates foreign key constraint" in error_str.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete subject because it is still referenced by other records (e.g., exam subjects, documents, or programme associations). Please remove these references first.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete subject due to database constraint violation",
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while deleting the subject: {str(e)}",
        )


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


# Bulk Upload Endpoints


@router.post("/bulk-upload", response_model=SubjectBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_subjects(
    session: DBSessionDep, file: UploadFile = File(...)
) -> SubjectBulkUploadResponse:
    """Bulk upload subjects from Excel or CSV file."""
    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_upload_file(file_content, file.filename or "unknown")
        validate_required_columns(df)
    except (SubjectUploadParseError, SubjectUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[SubjectBulkUploadError] = []
    # Track codes and original_codes within the batch for duplicate detection
    batch_codes: set[str] = set()
    batch_original_codes: set[str] = set()

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            subject_data = parse_subject_row(row)

            # Validate required fields
            if not subject_data["code"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number, error_message="Code is required", field="code"
                    )
                )
                failed += 1
                continue

            # Validate code length based on programme_type
            # If programme_type is CERT2 or None, code must be exactly 3 characters
            # If programme_type is NVTI, code can be 1-10 characters (saved as-is)
            programme_type = subject_data.get("programme_type") or ProgrammeType.CERT2
            if programme_type == ProgrammeType.CERT2:
                if len(subject_data["code"]) != 3:
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message="Code must be exactly 3 characters for CERT2 programme type",
                            field="code",
                        )
                    )
                    failed += 1
                    continue
            elif programme_type == ProgrammeType.NVTI:
                if len(subject_data["code"]) < 1 or len(subject_data["code"]) > 10:
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message="Code must be between 1 and 10 characters for NVTI programme type",
                            field="code",
                        )
                    )
                    failed += 1
                    continue

            if not subject_data["original_code"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number, error_message="Original code is required", field="original_code"
                    )
                )
                failed += 1
                continue

            # Check for duplicate codes within the batch
            if subject_data["code"] in batch_codes:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Duplicate code '{subject_data['code']}' found in upload batch",
                        field="code",
                    )
                )
                failed += 1
                continue

            # Check for duplicate original_codes within the batch
            if subject_data["original_code"] in batch_original_codes:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Duplicate original_code '{subject_data['original_code']}' found in upload batch",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            if not subject_data["name"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number, error_message="Name is required", field="name"
                    )
                )
                failed += 1
                continue

            if subject_data["subject_type"] is None:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message="Subject type is required and must be 'CORE' or 'ELECTIVE'",
                        field="subject_type",
                    )
                )
                failed += 1
                continue

            if subject_data["exam_type"] is None:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message="Exam type is required and must be a valid exam type (Certificate II Examinations, Advance, Technician Part I/II/III, or Diploma)",
                        field="exam_type",
                    )
                )
                failed += 1
                continue

            # Ensure programme_type variable is available for Subject creation
            # It was already set during code validation above, but may not be in scope here
            # Recalculate it if needed (for validation purposes, None defaults to CERT2)
            programme_type_for_creation = subject_data.get("programme_type")  # Store original value (may be None)

            # Check if subject with code already exists in database
            existing_stmt = select(Subject).where(Subject.code == subject_data["code"])
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()
            if existing:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Subject with code '{subject_data['code']}' already exists",
                        field="code",
                    )
                )
                failed += 1
                continue

            # Check if subject with original_code already exists in database
            existing_original_stmt = select(Subject).where(Subject.original_code == subject_data["original_code"])
            existing_original_result = await session.execute(existing_original_stmt)
            existing_original = existing_original_result.scalar_one_or_none()
            if existing_original:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Subject with original_code '{subject_data['original_code']}' already exists",
                        field="original_code",
                    )
                )
                failed += 1
                continue

            # Validate programme_code if provided (before creating subject)
            programme_code = subject_data.get("programme_code")
            programme = None
            if programme_code:
                # Lookup programme by code
                programme_stmt = select(Programme).where(Programme.code == programme_code)
                programme_result = await session.execute(programme_stmt)
                programme = programme_result.scalar_one_or_none()
                if not programme:
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message=f"Programme with code '{programme_code}' not found",
                            field="programme_code",
                        )
                    )
                    failed += 1
                    continue

            # Create subject
            db_subject = Subject(
                code=subject_data["code"],
                original_code=subject_data["original_code"],
                name=subject_data["name"],
                subject_type=subject_data["subject_type"],
                exam_type=subject_data["exam_type"],
                programme_type=programme_type_for_creation,  # Store as-is (None will be treated as CERT2 in validation)
            )
            session.add(db_subject)
            await session.flush()  # Flush to get ID but don't commit yet

            # Track codes and original_codes in batch for duplicate detection
            batch_codes.add(subject_data["code"])
            batch_original_codes.add(subject_data["original_code"])

            # Handle subject-programme associations based on subject type
            if subject_data["subject_type"] == SubjectType.CORE:
                # For CORE subjects: auto-associate with all existing programmes
                # (ignore programme_code if provided, but it was already validated)
                all_programmes_stmt = select(Programme)
                all_programmes_result = await session.execute(all_programmes_stmt)
                all_programmes = all_programmes_result.scalars().all()

                # Get existing associations for this subject to avoid duplicates
                existing_assoc_stmt = select(programme_subjects.c.programme_id).where(
                    programme_subjects.c.subject_id == db_subject.id
                )
                existing_assoc_result = await session.execute(existing_assoc_stmt)
                existing_programme_ids = {row[0] for row in existing_assoc_result.all()}

                # Create associations with all programmes, setting is_compulsory=True
                associations_to_create = []
                for prog in all_programmes:
                    if prog.id not in existing_programme_ids:
                        associations_to_create.append(
                            {
                                "programme_id": prog.id,
                                "subject_id": db_subject.id,
                                "is_compulsory": True,  # Core subjects are compulsory by default
                                "choice_group_id": None,
                            }
                        )

                # Batch insert associations
                if associations_to_create:
                    await session.execute(insert(programme_subjects).values(associations_to_create))
            else:
                # For ELECTIVE subjects: use existing behavior (optional programme_code)
                if programme:
                    # Check if association already exists
                    assoc_stmt = select(programme_subjects).where(
                        programme_subjects.c.programme_id == programme.id,
                        programme_subjects.c.subject_id == db_subject.id,
                    )
                    assoc_result = await session.execute(assoc_stmt)
                    existing_assoc = assoc_result.first()
                    if not existing_assoc:
                        # Create association
                        await session.execute(
                            insert(programme_subjects).values(
                                programme_id=programme.id,
                                subject_id=db_subject.id,
                                is_compulsory=None,  # Default values, can be updated later
                                choice_group_id=None,
                            )
                        )

            successful += 1

        except Exception as e:
            errors.append(
                SubjectBulkUploadError(
                    row_number=row_number,
                    error_message=f"Unexpected error: {str(e)}",
                    field=None,
                )
            )
            failed += 1
            continue

    # Commit all successful inserts
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit subjects: {str(e)}",
        )

    return SubjectBulkUploadResponse(
        total_rows=total_rows, successful=successful, failed=failed, errors=errors
    )
