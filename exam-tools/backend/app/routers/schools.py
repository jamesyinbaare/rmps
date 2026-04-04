"""School CRUD entrypoints for exam-tools (create + bulk upload)."""

from typing import cast
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Region, School, SchoolType, Zone
from app.schemas.school import (
    ProvisionedSupervisor,
    SchoolBulkUploadError,
    SchoolBulkUploadResponse,
    SchoolCreate,
    SchoolCreatedResponse,
    SchoolResponse,
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
