"""Subject CRUD and bulk upload."""

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError

from app.dependencies.auth import SuperAdminDep, SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Programme, Subject, SubjectType, programme_subjects
from app.schemas.subject import (
    SubjectBulkUploadError,
    SubjectBulkUploadResponse,
    SubjectCreate,
    SubjectListResponse,
    SubjectResponse,
    SubjectUpdate,
)
from app.services.subject_upload import (
    SubjectUploadParseError,
    SubjectUploadValidationError,
    parse_subject_row,
)
from app.services.subject_upload import (
    parse_upload_file as parse_subject_upload_file,
)
from app.services.subject_upload import (
    validate_required_columns as validate_subject_columns,
)
from app.services.template_generator import generate_subject_template

router = APIRouter(prefix="/subjects", tags=["subjects"])

_MAX_PAGE_SIZE = 100


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(
    subject: SubjectCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SubjectResponse:
    stmt = select(Subject).where(Subject.code == subject.code)
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject with code {subject.code} already exists",
        )

    if subject.original_code:
        original_code_stmt = select(Subject).where(Subject.original_code == subject.original_code)
        original_code_result = await session.execute(original_code_stmt)
        if original_code_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject with original_code {subject.original_code} already exists",
            )

    db_subject = Subject(
        code=subject.code,
        original_code=subject.original_code,
        name=subject.name,
        subject_type=subject.subject_type,
    )
    session.add(db_subject)
    await session.commit()
    await session.refresh(db_subject)
    return SubjectResponse.model_validate(db_subject)


@router.get("", response_model=SubjectListResponse)
async def list_subjects(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=_MAX_PAGE_SIZE),
) -> SubjectListResponse:
    offset = (page - 1) * page_size

    count_stmt = select(func.count(Subject.id))
    count_result = await session.execute(count_stmt)
    total = int(count_result.scalar() or 0)

    stmt = select(Subject).offset(offset).limit(page_size).order_by(Subject.code)
    result = await session.execute(stmt)
    subjects = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return SubjectListResponse(
        items=[SubjectResponse.model_validate(s) for s in subjects],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/template")
async def download_subject_template(_admin: SuperAdminDep) -> StreamingResponse:
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
        ) from e


@router.post("/bulk-upload", response_model=SubjectBulkUploadResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_subjects(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    file: UploadFile = File(...),
) -> SubjectBulkUploadResponse:
    file_content = await file.read()

    try:
        df = parse_subject_upload_file(file_content, file.filename or "unknown")
        validate_subject_columns(df)
    except (SubjectUploadParseError, SubjectUploadValidationError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    total_rows = len(df)
    successful = 0
    failed = 0
    errors: list[SubjectBulkUploadError] = []
    batch_codes: set[str] = set()
    batch_original_codes: set[str] = set()

    for idx, row in df.iterrows():
        row_number = int(idx) + 2
        try:
            subject_data = parse_subject_row(row)

            if not subject_data["code"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number, error_message="Code is required", field="code"
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

            if not subject_data["subject_type"]:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message="Subject type is required and must be CORE or ELECTIVE",
                        field="subject_type",
                    )
                )
                failed += 1
                continue

            existing_stmt = select(Subject).where(Subject.code == subject_data["code"])
            existing_result = await session.execute(existing_stmt)
            if existing_result.scalar_one_or_none() is not None:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Subject with code '{subject_data['code']}' already exists",
                        field="code",
                    )
                )
                failed += 1
                continue

            if subject_data["code"] in batch_codes:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Duplicate code '{subject_data['code']}' found in upload file",
                        field="code",
                    )
                )
                failed += 1
                continue

            original_code_val = subject_data.get("original_code")
            if original_code_val:
                if original_code_val in batch_original_codes:
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message=(
                                f"Duplicate original_code '{original_code_val}' found in upload file"
                            ),
                            field="original_code",
                        )
                    )
                    failed += 1
                    continue
                existing_oc_stmt = select(Subject).where(Subject.original_code == original_code_val)
                existing_oc_result = await session.execute(existing_oc_stmt)
                if existing_oc_result.scalar_one_or_none() is not None:
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message=(
                                f"Subject with original_code '{original_code_val}' already exists"
                            ),
                            field="original_code",
                        )
                    )
                    failed += 1
                    continue

            programme = None
            programme_code = subject_data.get("programme_code")
            if programme_code and isinstance(programme_code, str) and programme_code.strip():
                programme_stmt = select(Programme).where(Programme.code == programme_code.strip())
                programme_result = await session.execute(programme_stmt)
                programme = programme_result.scalar_one_or_none()
                if programme is None:
                    errors.append(
                        SubjectBulkUploadError(
                            row_number=row_number,
                            error_message=f"Programme with code '{programme_code}' not found",
                            field="programme_code",
                        )
                    )
                    failed += 1
                    continue

            is_compulsory = None
            choice_group_id = None
            if subject_data["subject_type"] == SubjectType.CORE:
                parsed_choice_group_id = subject_data.get("choice_group_id")
                if parsed_choice_group_id is not None:
                    if isinstance(parsed_choice_group_id, int) and parsed_choice_group_id > 0:
                        is_compulsory = False
                        choice_group_id = parsed_choice_group_id
                    else:
                        errors.append(
                            SubjectBulkUploadError(
                                row_number=row_number,
                                error_message=(
                                    f"Invalid choice_group_id '{parsed_choice_group_id}' for core subject. "
                                    "Must be a positive integer."
                                ),
                                field="choice_group_id",
                            )
                        )
                        failed += 1
                        continue
                else:
                    is_compulsory = True

            try:
                async with session.begin_nested():
                    db_subject = Subject(
                        code=subject_data["code"],
                        original_code=subject_data.get("original_code"),
                        name=subject_data["name"],
                        subject_type=subject_data["subject_type"],
                    )
                    session.add(db_subject)
                    await session.flush()

                    if subject_data["subject_type"] == SubjectType.CORE:
                        all_programmes_stmt = select(Programme)
                        all_programmes_result = await session.execute(all_programmes_stmt)
                        all_programmes = all_programmes_result.scalars().all()

                        for prog in all_programmes:
                            assoc_stmt = select(programme_subjects).where(
                                programme_subjects.c.programme_id == prog.id,
                                programme_subjects.c.subject_id == db_subject.id,
                            )
                            assoc_result = await session.execute(assoc_stmt)
                            if assoc_result.first() is None:
                                await session.execute(
                                    insert(programme_subjects).values(
                                        programme_id=prog.id,
                                        subject_id=db_subject.id,
                                        is_compulsory=is_compulsory,
                                        choice_group_id=choice_group_id,
                                    )
                                )
                    elif programme:
                        assoc_stmt = select(programme_subjects).where(
                            programme_subjects.c.programme_id == programme.id,
                            programme_subjects.c.subject_id == db_subject.id,
                        )
                        assoc_result = await session.execute(assoc_stmt)
                        if assoc_result.first() is None:
                            await session.execute(
                                insert(programme_subjects).values(
                                    programme_id=programme.id,
                                    subject_id=db_subject.id,
                                    is_compulsory=None,
                                    choice_group_id=None,
                                )
                            )
            except IntegrityError as e:
                errors.append(
                    SubjectBulkUploadError(
                        row_number=row_number,
                        error_message=f"Database constraint failed: {e.orig!s}",
                        field=None,
                    )
                )
                failed += 1
                continue

            batch_codes.add(subject_data["code"])
            if original_code_val:
                batch_original_codes.add(original_code_val)
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

    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit subjects: {str(e)}",
        ) from e

    return SubjectBulkUploadResponse(
        total_rows=total_rows, successful=successful, failed=failed, errors=errors
    )


@router.get("/{subject_id}", response_model=SubjectResponse)
async def get_subject(
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> SubjectResponse:
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return SubjectResponse.model_validate(subject)


@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: int,
    subject_update: SubjectUpdate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SubjectResponse:
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    if subject_update.code is not None and subject_update.code != subject.code:
        code_stmt = select(Subject).where(Subject.code == subject_update.code)
        code_result = await session.execute(code_stmt)
        if code_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject with code {subject_update.code} already exists",
            )

    if subject_update.original_code is not None and subject_update.original_code != subject.original_code:
        if subject_update.original_code:
            original_code_stmt = select(Subject).where(Subject.original_code == subject_update.original_code)
            original_code_result = await session.execute(original_code_stmt)
            if original_code_result.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Subject with original_code {subject_update.original_code} already exists",
                )

    update_data = subject_update.model_dump(exclude_unset=True)
    if "name" in update_data:
        subject.name = subject_update.name  # type: ignore[assignment]
    if "code" in update_data:
        subject.code = subject_update.code  # type: ignore[assignment]
    if "original_code" in update_data:
        subject.original_code = subject_update.original_code  # type: ignore[assignment]
    if "subject_type" in update_data:
        subject.subject_type = subject_update.subject_type  # type: ignore[assignment]

    await session.commit()
    await session.refresh(subject)
    return SubjectResponse.model_validate(subject)


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    subject_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    stmt = select(Subject).where(Subject.id == subject_id)
    result = await session.execute(stmt)
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    await session.delete(subject)
    await session.commit()
