"""Inspector account creation (single + bulk upload)."""

from datetime import datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import asc, delete, desc, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.core.passwords import generate_inspector_password
from app.core.security import get_password_hash
from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import ExamInspectorSubjectScope, RefreshToken, School, User, UserRole
from app.schemas.inspector import (
    InspectorBulkCreatedRow,
    InspectorBulkUploadError,
    InspectorBulkUploadResponse,
    InspectorCreate,
    InspectorCreatedPostingRow,
    InspectorCreatedResponse,
    InspectorListResponse,
    InspectorPasswordReset,
    InspectorPasswordResetResponse,
    InspectorSchoolRow,
    InspectorUpdate,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.inspector_posting import (
    create_inspector_postings_from_core_elective_codes,
    create_inspector_postings_from_targets,
)
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    normalize_column_names,
    parse_inspector_full_name,
    parse_inspector_password,
    parse_inspector_phone_number,
    read_upload_as_dataframe,
    validate_inspector_required_columns,
)
from app.services.sms import maybe_send_inspector_credentials

router = APIRouter(prefix="/inspectors", tags=["inspectors"])

_MAX_PAGE_SIZE = 100
_DEFAULT_PAGE_SIZE = 20

_SORT_COLUMNS = {
    "full_name": User.full_name,
    "phone": User.phone_number,
    "school_code": User.school_code,
}


def _inspector_school_row(user: User) -> InspectorSchoolRow:
    return InspectorSchoolRow(
        id=user.id,
        full_name=cast(str, user.full_name),
        phone_number=cast(str | None, user.phone_number),
        school_code=cast(str | None, user.school_code),
        school_name=None,
        is_active=bool(user.is_active),
    )


async def _load_inspector_user(session: DBSessionDep, user_id: UUID) -> User:
    stmt = select(User).where(User.id == user_id, User.role == UserRole.INSPECTOR)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspector not found")
    return user


async def _ensure_unique_inspector_phone(
    session: DBSessionDep,
    phone_number: str,
    *,
    exclude_user_id: UUID | None = None,
) -> None:
    stmt = select(User).where(User.role == UserRole.INSPECTOR, User.phone_number == phone_number)
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    dup = (await session.execute(stmt)).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An inspector with this phone_number already exists",
        )


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
    is_active: bool | None = Query(None, description="Filter by active status"),
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
    if is_active is not None:
        filters.append(User.is_active == is_active)
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
    items = [_inspector_school_row(row) for row in result.scalars().all()]
    return InspectorListResponse(items=items, total=total)


@router.patch("/{user_id}", response_model=InspectorSchoolRow, summary="Update an inspector account")
async def update_inspector(
    user_id: UUID,
    data: InspectorUpdate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> InspectorSchoolRow:
    user = await _load_inspector_user(session, user_id)
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone_number is not None:
        await _ensure_unique_inspector_phone(session, data.phone_number, exclude_user_id=user.id)
        user.phone_number = data.phone_number
    if data.is_active is not None:
        user.is_active = data.is_active
        if not data.is_active:
            await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    try:
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update inspector (constraint violation)",
        ) from None
    return _inspector_school_row(user)


@router.post(
    "/{user_id}/reset-password",
    response_model=InspectorPasswordResetResponse,
    summary="Reset an inspector password",
)
async def reset_inspector_password(
    user_id: UUID,
    data: InspectorPasswordReset,
    session: DBSessionDep,
    admin: SuperAdminDep,
) -> InspectorPasswordResetResponse:
    generated_password: str | None = None
    if data.mode == "auto":
        new_password = generate_inspector_password(8)
        generated_password = new_password
    else:
        assert data.new_password is not None
        new_password = data.new_password
        if len(new_password) < settings.password_min_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"password must be at least {settings.password_min_length} characters",
            )
    user = await _load_inspector_user(session, user_id)
    user.hashed_password = get_password_hash(new_password)
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await session.commit()
    phone = cast(str | None, user.phone_number)
    sms_sent: bool | None = None
    sms_error: str | None = None
    sms_delivery_id: UUID | None = None
    if phone:
        sms_sent, sms_error, sms_delivery_id = await maybe_send_inspector_credentials(
            phone,
            new_password,
            data.send_sms,
            session=session,
            user_id=user.id,
            trigger="reset",
            triggered_by_user_id=admin.id,
        )
    return InspectorPasswordResetResponse(
        sms_sent=sms_sent,
        sms_error=sms_error,
        sms_delivery_id=sms_delivery_id,
        generated_password=generated_password,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an inspector account")
async def delete_inspector(
    user_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    user = await _load_inspector_user(session, user_id)
    await session.delete(user)
    await session.commit()


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
    """Create one inspector. Optional postings via ``postings`` or core/elective centre host codes."""
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
    wants_postings = data.examination_id is not None and (
        bool(data.postings) or bool(core_s) or bool(elective_s)
    )

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
                if data.postings:
                    targets = [
                        (ExamInspectorSubjectScope(p.subject_scope.value), p.center_code.strip())
                        for p in data.postings
                    ]
                    postings = await create_inspector_postings_from_targets(
                        session,
                        examination_id=data.examination_id,
                        inspector_user_id=user.id,
                        targets=targets,
                        created_by_user_id=admin.id,
                        notes=None,
                    )
                else:
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

    sms_sent, sms_error, sms_delivery_id = await maybe_send_inspector_credentials(
        data.phone_number,
        data.password,
        data.send_sms,
        session=session,
        user_id=user.id,
        trigger="create",
        triggered_by_user_id=admin.id,
    )
    return InspectorCreatedResponse(
        id=user.id,
        school_code=user.school_code,
        phone_number=user.phone_number,
        full_name=cast(str, user.full_name),
        role=cast(UserRole, user.role),
        created_at=cast(datetime, user.created_at),
        created_postings=created_postings,
        sms_sent=sms_sent,
        sms_error=sms_error,
        sms_delivery_id=sms_delivery_id,
    )


@router.post(
    "/bulk-upload",
    response_model=InspectorBulkUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk-create inspector accounts from CSV or Excel",
)
async def bulk_upload_inspectors(
    session: DBSessionDep,
    admin: SuperAdminDep,
    file: UploadFile = File(...),
    send_sms: bool = Query(False, description="Send login credentials SMS for each created inspector"),
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
        sms_sent, sms_error, _delivery_id = await maybe_send_inspector_credentials(
            phone_number,
            password,
            send_sms,
            bulk=True,
            session=session,
            user_id=user.id,
            trigger="bulk_create",
            triggered_by_user_id=admin.id,
        )
        created.append(
            InspectorBulkCreatedRow(
                row_number=row_number,
                phone_number=phone_number,
                full_name=full_name,
                sms_sent=sms_sent,
                sms_error=sms_error,
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
