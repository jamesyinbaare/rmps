"""School CRUD entrypoints for exam-tools (create + bulk upload)."""

from typing import cast
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, insert, or_, select
from sqlalchemy.exc import IntegrityError

from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Programme, Region, School, SchoolType, User, UserRole, Zone, school_programmes
from app.schemas.inspector import InspectorSchoolRow
from app.schemas.programme import ProgrammeResponse
from app.schemas.school import (
    ExaminationCenterDetailResponse,
    ExaminationCenterListResponse,
    ExaminationCenterSummary,
    ProvisionedSupervisor,
    SchoolBulkUploadError,
    SchoolBulkUploadResponse,
    SchoolCreate,
    SchoolCreatedResponse,
    SchoolListResponse,
    SchoolResponse,
    SchoolUpdate,
)
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    normalize_column_names,
    parse_bool_cell,
    parse_region,
    parse_school_code,
    parse_school_name,
    parse_school_type,
    parse_writes_at_center_code,
    parse_writes_at_center_id,
    parse_zone,
    read_upload_as_dataframe,
    validate_required_columns,
)
from app.services.supervisor_provisioning import provision_supervisor_for_school

router = APIRouter(prefix="/schools", tags=["schools"])

_MAX_PAGE_SIZE = 200
_DEFAULT_PAGE_SIZE = 20


@router.get(
    "",
    response_model=SchoolListResponse,
    summary="List schools (paginated)",
)
async def list_schools(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    q: str | None = Query(None, description="Search code or name (case-insensitive)"),
) -> SchoolListResponse:
    conditions = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(or_(School.code.ilike(pattern), School.name.ilike(pattern)))

    count_stmt = select(func.count()).select_from(School)
    list_stmt = select(School).order_by(School.code)
    if conditions:
        count_stmt = count_stmt.where(*conditions)
        list_stmt = list_stmt.where(*conditions)

    total = int(await session.scalar(count_stmt) or 0)
    result = await session.execute(list_stmt.offset(skip).limit(limit))
    items = [SchoolResponse.model_validate(s) for s in result.scalars().all()]
    return SchoolListResponse(items=items, total=total)


@router.get(
    "/examination-centers",
    response_model=ExaminationCenterListResponse,
    summary="List examination centres (schools with no writes_at_center)",
)
async def list_examination_centers(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    q: str | None = Query(None, description="Search code or name (case-insensitive)"),
) -> ExaminationCenterListResponse:
    """Schools where ``writes_at_center_id`` is null are treated as examination centre hosts."""

    base_filter = School.writes_at_center_id.is_(None)
    conditions: list = [base_filter]
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        conditions.append(or_(School.code.ilike(pattern), School.name.ilike(pattern)))

    hosted_counts = (
        select(
            School.writes_at_center_id.label("center_id"),
            func.count().label("cnt"),
        )
        .where(School.writes_at_center_id.isnot(None))
        .group_by(School.writes_at_center_id)
    ).subquery()

    count_stmt = select(func.count()).select_from(School).where(*conditions)
    total = int(await session.scalar(count_stmt) or 0)

    list_stmt = (
        select(School, func.coalesce(hosted_counts.c.cnt, 0).label("hosted_count"))
        .outerjoin(hosted_counts, hosted_counts.c.center_id == School.id)
        .where(*conditions)
        .order_by(School.code)
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(list_stmt)
    items = [
        ExaminationCenterSummary(
            school=SchoolResponse.model_validate(row[0]),
            hosted_school_count=int(row[1]),
        )
        for row in result.all()
    ]
    return ExaminationCenterListResponse(items=items, total=total)


@router.get(
    "/examination-centers/{center_id}",
    response_model=ExaminationCenterDetailResponse,
    summary="Examination centre detail (host school and schools that write there)",
)
async def get_examination_center_detail(
    center_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> ExaminationCenterDetailResponse:
    school = await session.get(School, center_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    if school.writes_at_center_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This school writes at another centre and is not an examination centre host",
        )

    hosted_stmt = (
        select(School).where(School.writes_at_center_id == center_id).order_by(School.code)
    )
    hosted_result = await session.execute(hosted_stmt)
    hosted_schools = [
        SchoolResponse.model_validate(s) for s in hosted_result.scalars().all()
    ]

    codes: set[str] = {cast(str, school.code)}
    codes.update(cast(str, s.code) for s in hosted_schools)
    insp_stmt = (
        select(User, School.name.label("school_name"))
        .join(School, School.code == User.school_code)
        .where(User.role == UserRole.INSPECTOR, User.school_code.in_(codes))
        .order_by(User.full_name, User.school_code)
    )
    insp_result = await session.execute(insp_stmt)
    inspectors = [
        InspectorSchoolRow(
            id=row[0].id,
            full_name=cast(str, row[0].full_name),
            phone_number=cast(str | None, row[0].phone_number),
            school_code=cast(str | None, row[0].school_code),
            school_name=cast(str, row[1]),
        )
        for row in insp_result.all()
    ]
    return ExaminationCenterDetailResponse(
        center=SchoolResponse.model_validate(school),
        hosted_schools=hosted_schools,
        inspectors=inspectors,
    )


@router.get(
    "/{school_id}/programmes",
    response_model=list[ProgrammeResponse],
    summary="Programmes linked to this school",
)
async def get_school_programmes(
    school_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> list[ProgrammeResponse]:
    school = await session.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    programme_stmt = (
        select(Programme)
        .join(school_programmes, Programme.id == school_programmes.c.programme_id)
        .where(school_programmes.c.school_id == school_id)
        .order_by(Programme.code)
    )
    programme_result = await session.execute(programme_stmt)
    programmes = programme_result.scalars().all()
    return [ProgrammeResponse.model_validate(p) for p in programmes]


@router.post(
    "/{school_id}/programmes/{programme_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Link a programme to this school",
)
async def attach_school_programme(
    school_id: UUID,
    programme_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    school = await session.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    programme = await session.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found")

    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == school_id,
        school_programmes.c.programme_id == programme_id,
    )
    assoc_result = await session.execute(assoc_stmt)
    if assoc_result.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Programme already linked to this school",
        )

    await session.execute(
        insert(school_programmes).values(school_id=school_id, programme_id=programme_id)
    )
    await session.commit()


@router.delete(
    "/{school_id}/programmes/{programme_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a programme link from this school",
)
async def detach_school_programme(
    school_id: UUID,
    programme_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    school = await session.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    assoc_stmt = select(school_programmes).where(
        school_programmes.c.school_id == school_id,
        school_programmes.c.programme_id == programme_id,
    )
    assoc_result = await session.execute(assoc_stmt)
    if assoc_result.first() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme link not found")

    await session.execute(
        delete(school_programmes).where(
            school_programmes.c.school_id == school_id,
            school_programmes.c.programme_id == programme_id,
        )
    )
    await session.commit()


@router.get(
    "/{school_id}",
    response_model=SchoolResponse,
    summary="Get a school by id",
)
async def get_school(
    school_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SchoolResponse:
    school = await session.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")
    return SchoolResponse.model_validate(school)


@router.patch(
    "/{school_id}",
    response_model=SchoolResponse,
    summary="Update a school",
)
async def update_school(
    school_id: UUID,
    data: SchoolUpdate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SchoolResponse:
    school = await session.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    payload = data.model_dump(exclude_unset=True)
    if not payload:
        return SchoolResponse.model_validate(school)

    if "writes_at_center_id" in payload:
        wid = payload["writes_at_center_id"]
        if wid is not None:
            if wid == school_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="writes_at_center_id cannot reference this school",
                )
            host = await session.get(School, wid)
            if host is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="writes_at_center_id does not reference an existing school",
                )

    for key, value in payload.items():
        setattr(school, key, value)

    try:
        await session.commit()
        await session.refresh(school)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update school (constraint violation)",
        ) from None

    return SchoolResponse.model_validate(school)


@router.delete(
    "/{school_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a school",
)
async def delete_school(
    school_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    """Remove a school only if no user is linked via ``school_code`` (supervisors/inspectors)."""
    school = await session.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School not found")

    code = cast(str, school.code)
    user_count_stmt = select(func.count()).select_from(User).where(User.school_code == code)
    user_count = int(await session.scalar(user_count_stmt) or 0)
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete school: supervisors or inspectors are linked to this school code",
        )

    await session.delete(school)
    await session.commit()


@router.post(
    "",
    response_model=SchoolCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a school (single)",
)
async def create_school(
    data: SchoolCreate,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SchoolCreatedResponse:
    """Create one school and a default supervisor user. Requires super admin JWT.

    ``writes_at_center_id`` must reference an existing school if provided.

    The supervisor's display name and password are both the school ``code``; login uses that
    code as username and the same value as password.
    """
    stmt = select(School).where(School.code == data.code)
    result = await session.execute(stmt)
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"School with code {data.code!r} already exists",
        )

    if data.writes_at_center_id is not None:
        host = await session.get(School, data.writes_at_center_id)
        if host is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="writes_at_center_id does not reference an existing school",
            )

    school = School(
        code=data.code,
        name=data.name,
        region=data.region,
        zone=data.zone,
        school_type=data.school_type,
        is_private_examination_center=data.is_private_examination_center,
        writes_at_center_id=data.writes_at_center_id,
    )
    session.add(school)
    try:
        supervisor_user, plain_password = await provision_supervisor_for_school(session, data.code)
        await session.commit()
        await session.refresh(school)
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create school or supervisor (constraint violation)",
        ) from None

    return SchoolCreatedResponse(
        school=SchoolResponse.model_validate(school),
        supervisor_full_name=cast(str, supervisor_user.full_name),
        supervisor_initial_password=plain_password,
    )


@router.post(
    "/bulk-upload",
    response_model=SchoolBulkUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk-create schools from CSV or Excel",
)
async def bulk_upload_schools(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    file: UploadFile = File(...),
) -> SchoolBulkUploadResponse:
    """Upload a CSV or Excel file to create many schools. Requires super admin JWT.

    **Required columns:** ``code``, ``name``, ``region``, ``zone``

    **Optional columns:** ``school_type`` (private/public), ``is_private_examination_center``,
    ``writes_at_center_code`` (6-char school code of host), ``writes_at_center_id`` (UUID of host).
    Do not set both ``writes_at_center_code`` and ``writes_at_center_id`` on the same row.

    Each created school's supervisor uses the school ``code`` as both display name and password;
    see ``provisioned_supervisors`` for the echoed credentials.

    **Example CSV header:**

    ``code,name,region,zone,school_type,is_private_examination_center,writes_at_center_code``

    Region and zone accept enum names (e.g. ``GREATER_ACCRA``, ``A``) or display values (e.g. ``Greater Accra``, ``A``).
    """
    content = await file.read()
    try:
        df = read_upload_as_dataframe(content, file.filename or "")
        df = normalize_column_names(df)
        validate_required_columns(df)
    except SchoolUploadParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    row_specs: list[
        tuple[int, str, str, Region, Zone, SchoolType | None, bool, str | None, UUID | None]
    ] = []
    errors: list[SchoolBulkUploadError] = []

    for i, (_, row) in enumerate(df.iterrows()):
        row_number = i + 2
        try:
            code = parse_school_code(row.get("code"))
            name = parse_school_name(row.get("name"))
            region = parse_region(row.get("region"))
            zone = parse_zone(row.get("zone"))
            st = parse_school_type(row.get("school_type"))
            is_pec = parse_bool_cell(row.get("is_private_examination_center"), default=False)
            wcc = parse_writes_at_center_code(row.get("writes_at_center_code"))
            wid = parse_writes_at_center_id(row.get("writes_at_center_id"))
        except ValueError as exc:
            errors.append(SchoolBulkUploadError(row_number=row_number, error_message=str(exc)))
            continue

        if wid is not None and wcc is not None:
            errors.append(
                SchoolBulkUploadError(
                    row_number=row_number,
                    error_message="Set only one of writes_at_center_code or writes_at_center_id",
                )
            )
            continue

        row_specs.append((row_number, code, name, region, zone, st, is_pec, wcc, wid))

    codes_for_lookup: set[str] = set()
    for _, code, _, _, _, _, _, wcc, _ in row_specs:
        codes_for_lookup.add(code)
        if wcc:
            codes_for_lookup.add(wcc)

    if codes_for_lookup:
        result = await session.execute(select(School).where(School.code.in_(codes_for_lookup)))
        existing_by_code: dict[str, School] = {
            cast(str, s.code): s for s in result.scalars().all()
        }
    else:
        existing_by_code = {}

    db_codes_before = set(existing_by_code.keys())

    seen_in_file: set[str] = set()
    successful = 0
    failed = len(errors)

    provisioned_supervisors: list[ProvisionedSupervisor] = []

    for row_number, code, name, region, zone, st, is_pec, wcc, wid in row_specs:
        if code in seen_in_file:
            errors.append(
                SchoolBulkUploadError(
                    row_number=row_number,
                    error_message=f"Duplicate school code {code!r} in file",
                )
            )
            failed += 1
            continue

        if code in db_codes_before:
            errors.append(
                SchoolBulkUploadError(
                    row_number=row_number,
                    error_message=f"School with code {code!r} already exists in database",
                )
            )
            failed += 1
            continue

        seen_in_file.add(code)

        writes_at_center_id = wid
        if wcc is not None:
            host = existing_by_code.get(wcc)
            if host is None:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number,
                        error_message=f"writes_at_center_code {wcc!r}: no school with that code (create host first or fix order)",
                    )
                )
                failed += 1
                continue
            writes_at_center_id = cast(UUID, host.id)

        if writes_at_center_id is not None:
            host = await session.get(School, writes_at_center_id)
            if host is None:
                errors.append(
                    SchoolBulkUploadError(
                        row_number=row_number,
                        error_message="writes_at_center_id does not reference an existing school",
                    )
                )
                failed += 1
                continue

        school = School(
            code=code,
            name=name,
            region=region,
            zone=zone,
            school_type=st,
            is_private_examination_center=is_pec,
            writes_at_center_id=writes_at_center_id,
        )
        session.add(school)
        try:
            supervisor_user, plain_password = await provision_supervisor_for_school(session, code)
            await session.commit()
            await session.refresh(school)
        except ValueError as exc:
            await session.rollback()
            errors.append(
                SchoolBulkUploadError(row_number=row_number, error_message=str(exc)),
            )
            failed += 1
            continue
        except IntegrityError:
            await session.rollback()
            errors.append(
                SchoolBulkUploadError(
                    row_number=row_number,
                    error_message=f"Could not insert school {code!r} (duplicate or constraint violation)",
                )
            )
            failed += 1
            continue

        existing_by_code[cast(str, school.code)] = school
        provisioned_supervisors.append(
            ProvisionedSupervisor(
                row_number=row_number,
                school_code=code,
                supervisor_full_name=cast(str, supervisor_user.full_name),
                supervisor_initial_password=plain_password,
            )
        )
        successful += 1

    total_rows = len(df)
    return SchoolBulkUploadResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
        provisioned_supervisors=provisioned_supervisors,
    )
