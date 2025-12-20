from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, insert, select

from app.dependencies.database import DBSessionDep
from app.models import ExamType, Programme, School, Subject, SubjectType, programme_subjects, school_programmes
from app.schemas.programme import (
    ProgrammeBulkUploadError,
    ProgrammeBulkUploadResponse,
    ProgrammeCreate,
    ProgrammeListResponse,
    ProgrammeResponse,
    ProgrammeSubjectAssociation,
    ProgrammeSubjectAssociationCreate,
    ProgrammeSubjectAssociationUpdate,
    ProgrammeSubjectRequirements,
    ProgrammeSubjectResponse,
    ProgrammeUpdate,
    SchoolProgrammeAssociation,
    SubjectChoiceGroup,
)
from app.services.programme_upload import (
    ProgrammeUploadParseError,
    ProgrammeUploadValidationError,
    parse_programme_row,
    parse_upload_file,
    validate_required_columns,
)
from app.services.template_generator import generate_programme_template

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

    db_programme = Programme(code=programme.code, name=programme.name, exam_type=programme.exam_type)
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


@router.get("/template")
async def download_programme_template() -> StreamingResponse:
    """Download Excel template for programme upload."""
    try:
        template_bytes = generate_programme_template()
        return StreamingResponse(
            iter([template_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename=programme_upload_template.xlsx'},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate template: {str(e)}",
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

    # Get fields that were actually provided in the update
    update_data = programme_update.model_dump(exclude_unset=True)

    if "name" in update_data:
        programme.name = programme_update.name
    if "code" in update_data:
        programme.code = programme_update.code
    if "exam_type" in update_data:
        programme.exam_type = programme_update.exam_type

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
        select(
            Subject,
            programme_subjects.c.created_at,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
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
            is_compulsory=is_compulsory,
            choice_group_id=choice_group_id,
            created_at=created_at,
        )
        for subject, created_at, is_compulsory, choice_group_id in subjects_data
    ]


@router.get("/{programme_id}/subject-requirements", response_model=ProgrammeSubjectRequirements)
async def get_programme_subject_requirements(
    programme_id: int, session: DBSessionDep
) -> ProgrammeSubjectRequirements:
    """Get all subject requirements for a programme (compulsory, choice groups, electives)."""
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if not programme:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    # Get all subjects for this programme
    subject_stmt = (
        select(
            Subject,
            programme_subjects.c.created_at,
            programme_subjects.c.is_compulsory,
            programme_subjects.c.choice_group_id,
        )
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(programme_subjects.c.programme_id == programme_id)
        .order_by(Subject.code)
    )
    subject_result = await session.execute(subject_stmt)
    subjects_data = subject_result.all()

    # Organize subjects into categories
    compulsory_core = []
    optional_core_by_group: dict[int, list[ProgrammeSubjectResponse]] = {}
    electives = []

    for subject, created_at, is_compulsory, choice_group_id in subjects_data:
        subject_response = ProgrammeSubjectResponse(
            subject_id=subject.id,
            subject_code=subject.code,
            subject_name=subject.name,
            subject_type=subject.subject_type,
            is_compulsory=is_compulsory,
            choice_group_id=choice_group_id,
            created_at=created_at,
        )

        if subject.subject_type == SubjectType.CORE:
            if is_compulsory is True:
                compulsory_core.append(subject_response)
            elif is_compulsory is False and choice_group_id is not None:
                if choice_group_id not in optional_core_by_group:
                    optional_core_by_group[choice_group_id] = []
                optional_core_by_group[choice_group_id].append(subject_response)
        elif subject.subject_type == SubjectType.ELECTIVE:
            electives.append(subject_response)

    # Convert optional core groups to SubjectChoiceGroup list
    optional_core_groups = [
        SubjectChoiceGroup(choice_group_id=group_id, subjects=subjects)
        for group_id, subjects in sorted(optional_core_by_group.items())
    ]

    return ProgrammeSubjectRequirements(
        compulsory_core=compulsory_core,
        optional_core_groups=optional_core_groups,
        electives=electives,
    )


@router.post(
    "/{programme_id}/subjects/{subject_id}",
    response_model=ProgrammeSubjectAssociation,
    status_code=status.HTTP_201_CREATED,
)
async def associate_subject_with_programme(
    programme_id: int,
    subject_id: int,
    association_data: ProgrammeSubjectAssociationCreate,
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

    # Validate: is_compulsory should only be set for CORE subjects
    if association_data.is_compulsory is not None and subject.subject_type != SubjectType.CORE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_compulsory can only be set for CORE subjects. For ELECTIVE subjects, it should be NULL.",
        )

    # Validate: choice_group_id should only be set for optional CORE subjects
    if association_data.choice_group_id is not None:
        if subject.subject_type != SubjectType.CORE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for CORE subjects.",
            )
        if association_data.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )

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
        insert(programme_subjects).values(
            programme_id=programme_id,
            subject_id=subject_id,
            is_compulsory=association_data.is_compulsory,
            choice_group_id=association_data.choice_group_id,
        )
    )
    await session.commit()

    return ProgrammeSubjectAssociation(
        programme_id=programme_id,
        subject_id=subject_id,
        subject_type=subject.subject_type,
        is_compulsory=association_data.is_compulsory,
        choice_group_id=association_data.choice_group_id,
    )


@router.put(
    "/{programme_id}/subjects/{subject_id}",
    response_model=ProgrammeSubjectAssociation,
)
async def update_programme_subject_association(
    programme_id: int,
    subject_id: int,
    association_update: ProgrammeSubjectAssociationUpdate,
    session: DBSessionDep,
) -> ProgrammeSubjectAssociation:
    """Update the programme-subject association (is_compulsory and choice_group_id)."""
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

    # Validate: is_compulsory should only be set for CORE subjects
    if association_update.is_compulsory is not None and subject.subject_type != SubjectType.CORE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_compulsory can only be set for CORE subjects. For ELECTIVE subjects, it should be NULL.",
        )

    # Validate: choice_group_id should only be set for optional CORE subjects
    if association_update.choice_group_id is not None:
        if subject.subject_type != SubjectType.CORE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for CORE subjects.",
            )
        # Check if is_compulsory is being set to True (conflict)
        if association_update.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )
        # Check existing is_compulsory value if not being updated
        if association_update.is_compulsory is None and existing.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )

    # Update association
    from sqlalchemy import update

    update_values = {}
    if association_update.is_compulsory is not None:
        update_values["is_compulsory"] = association_update.is_compulsory
    if association_update.choice_group_id is not None:
        update_values["choice_group_id"] = association_update.choice_group_id

    if update_values:
        await session.execute(
            update(programme_subjects)
            .where(
                programme_subjects.c.programme_id == programme_id,
                programme_subjects.c.subject_id == subject_id,
            )
            .values(**update_values)
        )
        await session.commit()

    # Get updated association
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    updated = result.first()

    return ProgrammeSubjectAssociation(
        programme_id=programme_id,
        subject_id=subject_id,
        subject_type=subject.subject_type,
        is_compulsory=updated.is_compulsory if updated else None,
        choice_group_id=updated.choice_group_id if updated else None,
    )


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


# Bulk Upload Endpoints


@router.post("/bulk-upload", response_model=ProgrammeBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_programmes(
    session: DBSessionDep, file: UploadFile = File(...)
) -> ProgrammeBulkUploadResponse:
    """Bulk upload programmes from Excel or CSV file."""
    # Read file content
    file_content = await file.read()

    # Parse file
    try:
        df = parse_upload_file(file_content, file.filename or "unknown")
        validate_required_columns(df)
    except (ProgrammeUploadParseError, ProgrammeUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Process each row
    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[ProgrammeBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2  # +2 because Excel rows are 1-indexed and header is row 1
        try:
            # Parse row data
            programme_data = parse_programme_row(row)

            # Validate required fields
            if not programme_data["code"]:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number, error_message="Code is required", field="code"
                    )
                )
                failed += 1
                continue

            if not programme_data["name"]:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number, error_message="Name is required", field="name"
                    )
                )
                failed += 1
                continue

            # Check if programme with code already exists
            existing_stmt = select(Programme).where(Programme.code == programme_data["code"])
            existing_result = await session.execute(existing_stmt)
            existing = existing_result.scalar_one_or_none()
            if existing:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number,
                        error_message=f"Programme with code '{programme_data['code']}' already exists",
                        field="code",
                    )
                )
                failed += 1
                continue

            # Validate exam_type if provided
            exam_type = programme_data["exam_type"]
            if exam_type is not None and not isinstance(exam_type, ExamType):
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number,
                        error_message="Invalid exam_type. Must be 'Certificate II Examination' or 'CBT'",
                        field="exam_type",
                    )
                )
                failed += 1
                continue

            # Create programme
            db_programme = Programme(
                code=programme_data["code"],
                name=programme_data["name"],
                exam_type=exam_type,
            )
            session.add(db_programme)
            await session.flush()  # Flush to get ID but don't commit yet
            successful += 1

        except Exception as e:
            errors.append(
                ProgrammeBulkUploadError(
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
            detail=f"Failed to commit programmes: {str(e)}",
        )

    return ProgrammeBulkUploadResponse(
        total_rows=total_rows, successful=successful, failed=failed, errors=errors
    )
