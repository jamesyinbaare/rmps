"""Inspector account creation (single + bulk upload)."""

from datetime import datetime
from typing import cast

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.core.security import get_password_hash
from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import ExamInspectorSubjectScope, School, User, UserRole
from app.schemas.inspector import (
    InspectorBulkCreatedRow,
    InspectorBulkUploadError,
    InspectorBulkUploadResponse,
    InspectorCreate,
    InspectorCreatedPostingRow,
    InspectorCreatedResponse,
    InspectorListResponse,
    InspectorSchoolRow,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.inspector_posting import create_inspector_postings_from_core_elective_codes
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    normalize_column_names,
    parse_inspector_full_name,
    parse_inspector_password,
    parse_inspector_phone_number,
    read_upload_as_dataframe,
    validate_inspector_required_columns,
)

router = APIRouter(prefix="/inspectors", tags=["inspectors"])

_MAX_PAGE_SIZE = 100
_DEFAULT_PAGE_SIZE = 20

_SORT_COLUMNS = {
    "full_name": User.full_name,
    "phone": User.phone_number,
    "school_code": User.school_code,
}


@router.get(
    "",
    response_model=InspectorListResponse,
    summary="List inspectors (paginated, searchable, sortable)",
)
async def list_inspectors(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    q: str | None = Query(None, description="Search name or phone"),
    sort: str = Query(
        "full_name",
        description="Sort field: full_name, phone, school_code",
    ),
    order: str = Query("asc", description="asc or desc"),
) -> InspectorListResponse:
    sort_key = (sort or "full_name").lower()
    if sort_key not in _SORT_COLUMNS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sort must be one of: full_name, phone, school_code",
        )
    order_key = (order or "asc").lower()
    if order_key not in ("asc", "desc"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="order must be asc or desc",
        )

    filters = [User.role == UserRole.INSPECTOR]
    search_filter = None
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        search_filter = or_(
            User.full_name.ilike(pattern),
            User.phone_number.ilike(pattern),
        )

    count_stmt = select(func.count()).select_from(User).where(*filters)
    if search_filter is not None:
        count_stmt = count_stmt.where(search_filter)
    total = int(await session.scalar(count_stmt) or 0)

    sort_col = _SORT_COLUMNS[sort_key]
    order_clause = asc(sort_col) if order_key == "asc" else desc(sort_col)

    list_stmt = select(User).where(*filters)
    if search_filter is not None:
        list_stmt = list_stmt.where(search_filter)
    list_stmt = list_stmt.order_by(order_clause, asc(User.id)).offset(skip).limit(limit)

    result = await session.execute(list_stmt)
    items = [
        InspectorSchoolRow(
            id=row.id,
            full_name=cast(str, row.full_name),
            phone_number=cast(str | None, row.phone_number),
            school_code=cast(str | None, row.school_code),
            school_name=None,
        )
        for row in result.scalars().all()
    ]
    return InspectorListResponse(items=items, total=total)


@router.post(
    "",
    response_model=InspectorCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an inspector account (single)",
)
async def create_inspector(
    data: InspectorCreate,
    session: DBSessionDep,
    admin: SuperAdminDep,
) -> InspectorCreatedResponse:
    """Create one inspector. Optional postings for an examination using core/elective centre host codes."""
    if len(data.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"password must be at least {settings.password_min_length} characters",
        )

    dup_stmt = select(User).where(User.role == UserRole.INSPECTOR, User.phone_number == data.phone_number)
    dup_result = await session.execute(dup_stmt)
    if dup_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An inspector with this phone_number already exists",
        )

    core_s = (data.core or "").strip()
    elective_s = (data.elective or "").strip()
    wants_postings = data.examination_id is not None and (bool(core_s) or bool(elective_s))

    user = User(
        school_code=None,
        phone_number=data.phone_number,
        full_name=data.full_name,
        role=UserRole.INSPECTOR,
        hashed_password=get_password_hash(data.password),
        is_active=True,
    )
    session.add(user)
    created_postings: list[InspectorCreatedPostingRow] = []

    try:
        await session.flush()
        if wants_postings:
            assert data.examination_id is not None
            try:
                await load_examination_or_raise(session, data.examination_id)
            except ValueError:
                await session.rollback()
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None
            try:
                postings = await create_inspector_postings_from_core_elective_codes(
                    session,
                    examination_id=data.examination_id,
                    inspector_user_id=user.id,
                    core_code=core_s or None,
                    elective_code=elective_s or None,
                    created_by_user_id=admin.id,
                    notes=None,
                )
            except ValueError as exc:
                await session.rollback()
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            except HTTPException:
                await session.rollback()
                raise
            for p, inserted in postings:
                if not inserted:
                    continue
                sch = await session.get(School, p.center_id)
                st_scope = p.subject_scope
                if isinstance(st_scope, ExamInspectorSubjectScope):
                    scope_str = st_scope.value
                else:
                    scope_str = str(st_scope)
                created_postings.append(
                    InspectorCreatedPostingRow(
                        posting_id=p.id,
                        center_code=cast(str, sch.code) if sch is not None else "",
                        subject_scope=scope_str,
                    )
                )
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create inspector (constraint violation)",
        ) from None

    return InspectorCreatedResponse(
        id=user.id,
        school_code=user.school_code,
        phone_number=user.phone_number,
        full_name=cast(str, user.full_name),
        role=cast(UserRole, user.role),
        created_at=cast(datetime, user.created_at),
        created_postings=created_postings,
    )


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
    """Required columns: ``phone_number``, ``full_name``, ``password``."""
    content = await file.read()
    try:
        df = read_upload_as_dataframe(content, file.filename or "", all_columns_as_string=True)
        df = normalize_column_names(df)
        validate_inspector_required_columns(df)
    except SchoolUploadParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    row_specs: list[tuple[int, str, str, str]] = []
    errors: list[InspectorBulkUploadError] = []

    for i, (_, row) in enumerate(df.iterrows()):
        row_number = i + 2
        try:
            phone_number = parse_inspector_phone_number(row.get("phone_number"))
            full_name = parse_inspector_full_name(row.get("full_name"))
            password = parse_inspector_password(row.get("password"), min_length=settings.password_min_length)
        except ValueError as exc:
            errors.append(InspectorBulkUploadError(row_number=row_number, error_message=str(exc)))
            continue
        row_specs.append((row_number, phone_number, full_name, password))

    phones_in_file = {spec[1] for spec in row_specs}
    existing_phones: set[str] = set()
    if phones_in_file:
        insp_result = await session.execute(
            select(User.phone_number).where(
                User.role == UserRole.INSPECTOR,
                User.phone_number.in_(phones_in_file),
            )
        )
        existing_phones = {cast(str, p) for p in insp_result.scalars().all() if p is not None}

    seen_in_file: set[str] = set()
    successful = 0
    failed = len(errors)
    created: list[InspectorBulkCreatedRow] = []

    for row_number, phone_number, full_name, password in row_specs:
        if phone_number in seen_in_file:
            errors.append(
                InspectorBulkUploadError(
                    row_number=row_number,
                    error_message=f"Duplicate phone_number in file: {phone_number!r}",
                )
            )
            failed += 1
            continue
        seen_in_file.add(phone_number)

        if phone_number in existing_phones:
            errors.append(
                InspectorBulkUploadError(
                    row_number=row_number,
                    error_message="An inspector with this phone_number already exists",
                )
            )
            failed += 1
            continue

        user = User(
            school_code=None,
            phone_number=phone_number,
            full_name=full_name,
            role=UserRole.INSPECTOR,
            hashed_password=get_password_hash(password),
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

        existing_phones.add(phone_number)
        created.append(
            InspectorBulkCreatedRow(
                row_number=row_number,
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
