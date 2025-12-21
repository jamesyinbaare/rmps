from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, insert, select

from app.dependencies.database import DBSessionDep
from app.models import Document, Programme, School, Subject, programme_subjects, school_programmes
from app.schemas.programme import SchoolProgrammeAssociation
from app.schemas.school import (
    SchoolBulkUploadError,
    SchoolBulkUploadResponse,
    SchoolCreate,
    SchoolResponse,
    SchoolStatistics,
    SchoolUpdate,
)
from app.services.school_upload import (
    SchoolUploadParseError,
    SchoolUploadValidationError,
    find_programmes_column,
    parse_school_row,
    parse_upload_file,
    validate_required_columns,
)
from app.services.template_generator import generate_school_template

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


@router.get("/template")
async def download_school_template() -> StreamingResponse:
    """Download Excel template for school upload."""
    try:
        template_bytes = generate_school_template()
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename=school_upload_template.xlsx'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
        )


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

    # Count total subjects (derived through programmes)
    subject_count_stmt = (
        select(func.count(func.distinct(programme_subjects.c.subject_id)))
        .select_from(programme_subjects)
        .join(school_programmes, programme_subjects.c.programme_id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
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
    """List subjects for a school (derived through programmes)."""
    stmt = select(School).where(School.id == school_id)
    result = await session.execute(stmt)
    school = result.scalar_one_or_none()
    if not school:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    # Get subjects through programmes
    subject_stmt = (
        select(Subject)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .join(school_programmes, programme_subjects.c.programme_id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
        .distinct()
        .order_by(Subject.code)
    )
    subject_result = await session.execute(subject_stmt)
    subjects = subject_result.scalars().all()

    from app.schemas.subject import SubjectResponse

    return [SubjectResponse.model_validate(subject) for subject in subjects]


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

    # Check if subject is available through school's programmes
    assoc_stmt = (
        select(programme_subjects.c.subject_id)
        .select_from(programme_subjects)
        .join(school_programmes, programme_subjects.c.programme_id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id, programme_subjects.c.subject_id == subject_id)
        .limit(1)
    )
    result = await session.execute(assoc_stmt)
    if not result.first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not available through any of the school's programmes"
        )

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


# Bulk Upload Endpoints


@router.post("/bulk-upload", response_model=SchoolBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_schools(session: DBSessionDep, file: UploadFile = File(...)) -> SchoolBulkUploadResponse:
    """Bulk upload schools from Excel or CSV file."""
    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_upload_file(file_content, file.filename or "unknown")
        validate_required_columns(df)
    except (SchoolUploadParseError, SchoolUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Find programmes column (comma-separated programme codes)
    programmes_column = find_programmes_column(df)

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[SchoolBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            school_data = parse_school_row(row, programmes_column)

            # Validate required fields
            if not school_data["code"]:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number, error_message="Code is required", field="code"
                    )
                )
                failed += 1
                continue

            if not school_data["name"]:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number, error_message="Name is required", field="name"
                    )
                )
                failed += 1
                continue

            if not school_data["region"]:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number,
                        error_message="Invalid or missing region. Must be a valid SchoolRegion value",
                        field="region",
                    )
                )
                failed += 1
                continue

            if not school_data["zone"]:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number,
                        error_message="Invalid or missing zone. Must be a single letter (A-Z)",
                        field="zone",
                    )
                )
                failed += 1
                continue

            # Check if school with code already exists
            existing_stmt = select(School).where(School.code == school_data["code"])
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()
            if existing:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number,
                        error_message=f"School with code '{school_data['code']}' already exists",
                        field="code",
                    )
                )
                failed += 1
                continue

            # Validate and collect programme codes
            valid_programme_ids: list[int] = []
            invalid_programme_codes: list[str] = []

            if school_data["programme_codes"]:
                for programme_code in school_data["programme_codes"]:
                    programme_stmt = select(Programme).where(Programme.code == programme_code)
                    programme_result = await session.execute(programme_stmt)
                    programme = programme_result.scalar_one_or_none()
                    if programme:
                        valid_programme_ids.append(programme.id)
                    else:
                        invalid_programme_codes.append(programme_code)

            # If there are invalid programme codes, record error but continue with school creation
            if invalid_programme_codes:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number,
                        error_message=f"Programme codes not found: {', '.join(invalid_programme_codes)}",
                        field="programme_codes",
                    )
                )
                # Note: We continue to create the school even if some programme codes are invalid

            # Create school
            db_school = School(
                code=school_data["code"],
                name=school_data["name"],
                region=school_data["region"],
                zone=school_data["zone"],
                school_type=school_data["school_type"],
            )
            session.add(db_school)
            await session.flush()  # Flush to get ID but don't commit yet

            # Create school-programme associations for valid programmes
            for programme_id in valid_programme_ids:
                # Check if association already exists (shouldn't for new school, but check anyway)
                assoc_stmt = select(school_programmes).where(
                    school_programmes.c.school_id == db_school.id,
                    school_programmes.c.programme_id == programme_id,
                )
                assoc_result = await session.execute(assoc_stmt)
                existing_assoc = assoc_result.first()
                if not existing_assoc:
                    await session.execute(
                        insert(school_programmes).values(
                            school_id=db_school.id, programme_id=programme_id
                        )
                    )

            successful += 1

        except Exception as e:
            errors.append(
                SchoolBulkUploadError(
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
            detail=f"Failed to commit schools: {str(e)}",
        )

    return SchoolBulkUploadResponse(
        total_rows=total_rows, successful=successful, failed=failed, errors=errors
    )
