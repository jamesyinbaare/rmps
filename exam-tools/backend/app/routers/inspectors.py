"""Inspector account creation (single + bulk upload)."""

from typing import cast

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import School, User, UserRole
from app.schemas.inspector import (
    InspectorBulkCreatedRow,
    InspectorBulkUploadError,
    InspectorBulkUploadResponse,
    InspectorCreate,
    InspectorCreatedResponse,
)
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    normalize_column_names,
    parse_inspector_full_name,
    parse_inspector_phone_number,
    parse_inspector_school_code,
    read_upload_as_dataframe,
    validate_inspector_required_columns,
)

router = APIRouter(prefix="/inspectors", tags=["inspectors"])


@router.post(
    "",
    response_model=InspectorCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an inspector account (single)",
)
async def create_inspector(
    data: InspectorCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> InspectorCreatedResponse:
    """Create one inspector user. Requires super admin JWT.

    Inspectors sign in with ``school_code`` (username) and ``phone_number`` (credential);
    no password hash is stored. Values are trimmed; clients must submit the same strings at login.
    """
    school_stmt = select(School).where(School.code == data.school_code)
    school_result = await session.execute(school_stmt)
    if school_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No school with code {data.school_code!r}",
        )

    dup_stmt = select(User).where(
        User.role == UserRole.INSPECTOR,
        User.school_code == data.school_code,
        User.phone_number == data.phone_number,
    )
    dup_result = await session.execute(dup_stmt)
    if dup_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An inspector with this school_code and phone_number already exists",
        )

    user = User(
        school_code=data.school_code,
        phone_number=data.phone_number,
        full_name=data.full_name,
        role=UserRole.INSPECTOR,
        hashed_password=None,
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create inspector (constraint violation)",
        ) from None

    return InspectorCreatedResponse.model_validate(user)


@router.post(
    "/bulk-upload",
    response_model=InspectorBulkUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk-create inspector accounts from CSV or Excel",
)
async def bulk_upload_inspectors(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    file: UploadFile = File(...),
) -> InspectorBulkUploadResponse:
    """Upload CSV or Excel to create many inspectors. Requires super admin JWT.

    **Required columns:** ``school_code``, ``phone_number``, ``full_name``

    **Example header:** ``school_code,phone_number,full_name``

    Inspectors log in with ``school_code`` and ``phone_number`` (see single-create docs).
    Uses the same file parsing helpers as school bulk upload.
    """
    content = await file.read()
    try:
        df = read_upload_as_dataframe(content, file.filename or "")
        df = normalize_column_names(df)
        validate_inspector_required_columns(df)
    except SchoolUploadParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    row_specs: list[tuple[int, str, str, str]] = []
    errors: list[InspectorBulkUploadError] = []

    for i, (_, row) in enumerate(df.iterrows()):
        row_number = i + 2
        try:
            school_code = parse_inspector_school_code(row.get("school_code"))
            phone_number = parse_inspector_phone_number(row.get("phone_number"))
            full_name = parse_inspector_full_name(row.get("full_name"))
        except ValueError as exc:
            errors.append(InspectorBulkUploadError(row_number=row_number, error_message=str(exc)))
            continue
        row_specs.append((row_number, school_code, phone_number, full_name))

    codes_in_file = {spec[1] for spec in row_specs}
    existing_school_codes: set[str] = set()
    db_inspector_pairs: set[tuple[str, str]] = set()

    if codes_in_file:
        sch_result = await session.execute(select(School).where(School.code.in_(codes_in_file)))
        existing_school_codes = {cast(str, s.code) for s in sch_result.scalars().all()}

        insp_result = await session.execute(
            select(User).where(
                User.role == UserRole.INSPECTOR,
                User.school_code.in_(codes_in_file),
            )
        )
        for u in insp_result.scalars().all():
            sc = cast(str | None, u.school_code)
            pn = cast(str | None, u.phone_number)
            if sc is not None and pn is not None:
                db_inspector_pairs.add((sc, pn))

    seen_in_file: set[tuple[str, str]] = set()
    successful = 0
    failed = len(errors)
    created: list[InspectorBulkCreatedRow] = []

    for row_number, school_code, phone_number, full_name in row_specs:
        pair = (school_code, phone_number)
        if pair in seen_in_file:
            errors.append(
                InspectorBulkUploadError(
                    row_number=row_number,
                    error_message=f"Duplicate school_code and phone_number in file: {school_code!r}, {phone_number!r}",
                )
            )
            failed += 1
            continue
        seen_in_file.add(pair)

        if school_code not in existing_school_codes:
            errors.append(
                InspectorBulkUploadError(
                    row_number=row_number,
                    error_message=f"No school with code {school_code!r}",
                )
            )
            failed += 1
            continue

        if pair in db_inspector_pairs:
            errors.append(
                InspectorBulkUploadError(
                    row_number=row_number,
                    error_message="An inspector with this school_code and phone_number already exists",
                )
            )
            failed += 1
            continue

        user = User(
            school_code=school_code,
            phone_number=phone_number,
            full_name=full_name,
            role=UserRole.INSPECTOR,
            hashed_password=None,
            is_active=True,
        )
        session.add(user)
        try:
            await session.commit()
            await session.refresh(user)
        except IntegrityError:
            await session.rollback()
            errors.append(
                InspectorBulkUploadError(
                    row_number=row_number,
                    error_message="Could not insert inspector (constraint violation)",
                )
            )
            failed += 1
            continue

        db_inspector_pairs.add(pair)
        created.append(
            InspectorBulkCreatedRow(
                row_number=row_number,
                school_code=school_code,
                phone_number=phone_number,
                full_name=full_name,
            )
        )
        successful += 1

    total_rows = len(df)
    return InspectorBulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
        created=created,
    )
