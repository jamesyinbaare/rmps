"""Programme CRUD, bulk upload, and programme–subject associations."""

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, insert, select, update

from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Programme, Subject, SubjectType, programme_subjects
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
    SubjectChoiceGroup,
)
from app.services.programme_upload import (
    ProgrammeUploadParseError,
    ProgrammeUploadValidationError,
    parse_programme_row,
)
from app.services.programme_upload import (
    parse_upload_file as parse_programme_upload_file,
)
from app.services.programme_upload import (
    validate_required_columns as validate_programme_columns,
)
from app.services.template_generator import generate_programme_template

router = APIRouter(prefix="/programmes", tags=["programmes"])

_MAX_PAGE_SIZE = 100


@router.post("", response_model=ProgrammeResponse, status_code=status.HTTP_201_CREATED)
async def create_programme(
    programme: ProgrammeCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> ProgrammeResponse:
    stmt = select(Programme).where(Programme.code == programme.code)
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Programme with code {programme.code} already exists",
        )

    db_programme = Programme(code=programme.code, name=programme.name)
    session.add(db_programme)
    await session.commit()
    await session.refresh(db_programme)
    return ProgrammeResponse.model_validate(db_programme)


@router.get("", response_model=ProgrammeListResponse)
async def list_programmes(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=_MAX_PAGE_SIZE),
) -> ProgrammeListResponse:
    offset = (page - 1) * page_size

    count_stmt = select(func.count(Programme.id))
    count_result = await session.execute(count_stmt)
    total = int(count_result.scalar() or 0)

    stmt = select(Programme).offset(offset).limit(page_size).order_by(Programme.code)
    result = await session.execute(stmt)
    programmes = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return ProgrammeListResponse(
        items=[ProgrammeResponse.model_validate(p) for p in programmes],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/template")
async def download_programme_template(_admin: SuperAdminDep) -> StreamingResponse:
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
        ) from e


@router.post("/bulk-upload", response_model=ProgrammeBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_programmes(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    file: UploadFile = File(...),
) -> ProgrammeBulkUploadResponse:
    file_content = await file.read()

    try:
        df = parse_programme_upload_file(file_content, file.filename or "unknown")
        validate_programme_columns(df)
    except (ProgrammeUploadParseError, ProgrammeUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[ProgrammeBulkUploadError] = []

    for idx, row in df.iterrows():
        row_number = int(idx) + 2
        try:
            programme_data = parse_programme_row(row)

            if not programme_data["code"]:
                errors.append(
                    ProgrammeBulkUploadError(row_number=row_number, error_message="Code is required", field="code")
                )
                failed += 1
                continue

            if not programme_data["name"]:
                errors.append(
                    ProgrammeBulkUploadError(row_number=row_number, error_message="Name is required", field="name")
                )
                failed += 1
                continue

            existing_stmt = select(Programme).where(Programme.code == programme_data["code"])
            existing_result = await session.execute(existing_stmt)
            if existing_result.scalar_one_or_none() is not None:
                errors.append(
                    ProgrammeBulkUploadError(
                        row_number=row_number,
                        error_message=f"Programme with code '{programme_data['code']}' already exists",
                        field="code",
                    )
                )
                failed += 1
                continue

            db_programme = Programme(
                code=programme_data["code"],
                name=programme_data["name"],
            )
            session.add(db_programme)
            await session.flush()
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

    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit programmes: {str(e)}",
        ) from e

    return ProgrammeBulkUploadResponse(
        total_rows=total_rows, successful=successful, failed=failed, errors=errors
    )


@router.get("/{programme_id}", response_model=ProgrammeResponse)
async def get_programme(
    programme_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> ProgrammeResponse:
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if programme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")
    return ProgrammeResponse.model_validate(programme)


@router.put("/{programme_id}", response_model=ProgrammeResponse)
async def update_programme(
    programme_id: int,
    programme_update: ProgrammeUpdate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> ProgrammeResponse:
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if programme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    if programme_update.code is not None and programme_update.code != programme.code:
        code_stmt = select(Programme).where(Programme.code == programme_update.code)
        code_result = await session.execute(code_stmt)
        if code_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Programme with code {programme_update.code} already exists",
            )

    update_data = programme_update.model_dump(exclude_unset=True)
    if "name" in update_data:
        programme.name = programme_update.name  # type: ignore[assignment]
    if "code" in update_data:
        programme.code = programme_update.code  # type: ignore[assignment]

    await session.commit()
    await session.refresh(programme)
    return ProgrammeResponse.model_validate(programme)


@router.delete("/{programme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_programme(
    programme_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    programme = result.scalar_one_or_none()
    if programme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    await session.delete(programme)
    await session.commit()


@router.get("/{programme_id}/subjects", response_model=list[ProgrammeSubjectResponse])
async def list_programme_subjects(
    programme_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> list[ProgrammeSubjectResponse]:
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

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
    programme_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> ProgrammeSubjectRequirements:
    stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

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

    compulsory_core: list[ProgrammeSubjectResponse] = []
    optional_core_by_group: dict[int, list[ProgrammeSubjectResponse]] = {}
    electives: list[ProgrammeSubjectResponse] = []

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
                optional_core_by_group.setdefault(choice_group_id, []).append(subject_response)
        elif subject.subject_type == SubjectType.ELECTIVE:
            electives.append(subject_response)

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
    _admin: SuperAdminDep,
) -> ProgrammeSubjectAssociation:
    programme_stmt = select(Programme).where(Programme.id == programme_id)
    result = await session.execute(programme_stmt)
    programme = result.scalar_one_or_none()
    if programme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    if association_data.is_compulsory is not None and subject.subject_type != SubjectType.CORE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_compulsory can only be set for CORE subjects. For ELECTIVE subjects, it should be NULL.",
        )

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

    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    if result.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Subject already associated with programme"
        )

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
    _admin: SuperAdminDep,
) -> ProgrammeSubjectAssociation:
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    existing = result.first()
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject association not found")

    subject_stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(subject_stmt)
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    if association_update.is_compulsory is not None and subject.subject_type != SubjectType.CORE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_compulsory can only be set for CORE subjects. For ELECTIVE subjects, it should be NULL.",
        )

    if association_update.choice_group_id is not None:
        if subject.subject_type != SubjectType.CORE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for CORE subjects.",
            )
        if association_update.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )
        if association_update.is_compulsory is None and existing.is_compulsory is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="choice_group_id can only be set for optional core subjects (is_compulsory=False).",
            )

    update_values: dict = {}
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

    assoc_stmt2 = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result2 = await session.execute(assoc_stmt2)
    updated = result2.first()

    return ProgrammeSubjectAssociation(
        programme_id=programme_id,
        subject_id=subject_id,
        subject_type=subject.subject_type,
        is_compulsory=updated.is_compulsory if updated else None,
        choice_group_id=updated.choice_group_id if updated else None,
    )


@router.delete("/{programme_id}/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_subject_association(
    programme_id: int,
    subject_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    assoc_stmt = select(programme_subjects).where(
        programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
    )
    result = await session.execute(assoc_stmt)
    if result.first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject association not found")

    await session.execute(
        delete(programme_subjects).where(
            programme_subjects.c.programme_id == programme_id, programme_subjects.c.subject_id == subject_id
        )
    )
    await session.commit()
