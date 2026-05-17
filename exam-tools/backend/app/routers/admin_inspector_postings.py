"""Super-admin CRUD for inspector examination postings."""

from datetime import datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.core.security import get_password_hash
from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ExamInspectorSubjectScope,
    InspectorExamPosting,
    School,
    User,
    UserRole,
)
from app.schemas.inspector_posting import (
    InspectorExamPostingCreate,
    InspectorExamPostingListResponse,
    InspectorExamPostingResponse,
    InspectorExamPostingUpdate,
    InspectorPostingBulkCreatedInspectorRow,
    InspectorPostingBulkCreatedPostingRow,
    InspectorPostingBulkUploadError,
    InspectorPostingBulkUploadResponse,
)
from app.services.exam_timetable_pdf import load_examination_or_raise
from app.services.inspector_posting import (
    assert_centre_host_school,
    create_inspector_postings_from_core_elective_codes,
    validate_new_posting_no_overlap,
)
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    normalize_column_names,
    parse_inspector_full_name,
    parse_inspector_phone_number,
    parse_optional_examination_centre_host_code,
    parse_optional_inspector_password,
    read_upload_as_dataframe,
    validate_inspector_posting_bulk_required_columns,
)
from app.services.template_generator import generate_inspector_postings_bulk_template

router = APIRouter(prefix="/admin/examinations", tags=["admin-inspector-postings"])


def _posting_to_response(
    row: InspectorExamPosting,
    center: School,
    inspector: User,
) -> InspectorExamPostingResponse:
    scope = row.subject_scope
    if isinstance(scope, ExamInspectorSubjectScope):
        scope_str = scope.value
    else:
        scope_str = str(scope)
    return InspectorExamPostingResponse(
        id=row.id,
        examination_id=row.examination_id,
        inspector_user_id=row.inspector_user_id,
        inspector_full_name=cast(str, inspector.full_name),
        inspector_phone_number=cast(str | None, inspector.phone_number),
        center_id=row.center_id,
        center_code=cast(str, center.code),
        center_name=cast(str, center.name),
        subject_scope=scope_str,
        notes=cast(str | None, row.notes),
        created_by_user_id=cast(UUID | None, row.created_by_user_id),
        created_at=cast(datetime, row.created_at),
        updated_at=cast(datetime, row.updated_at),
    )


@router.get(
    "/{examination_id}/inspector-postings",
    response_model=InspectorExamPostingListResponse,
)
async def list_inspector_postings(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
    inspector_user_id: UUID | None = Query(None),
    center_id: UUID | None = Query(None),
) -> InspectorExamPostingListResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    stmt = select(InspectorExamPosting).where(InspectorExamPosting.examination_id == examination_id)
    if inspector_user_id is not None:
        stmt = stmt.where(InspectorExamPosting.inspector_user_id == inspector_user_id)
    if center_id is not None:
        stmt = stmt.where(InspectorExamPosting.center_id == center_id)
    stmt = stmt.order_by(InspectorExamPosting.id)
    rows = list((await session.execute(stmt)).scalars().all())
    if not rows:
        return InspectorExamPostingListResponse(items=[])

    centre_ids = {r.center_id for r in rows}
    inspector_ids = {r.inspector_user_id for r in rows}
    sch_stmt = select(School).where(School.id.in_(centre_ids))
    centres = {s.id: s for s in (await session.execute(sch_stmt)).scalars().all()}
    insp_stmt = select(User).where(User.id.in_(inspector_ids))
    inspectors = {u.id: u for u in (await session.execute(insp_stmt)).scalars().all()}
    out: list[InspectorExamPostingResponse] = []
    for r in rows:
        c = centres.get(r.center_id)
        insp = inspectors.get(r.inspector_user_id)
        if c is None or insp is None:
            continue
        out.append(_posting_to_response(r, c, insp))
    return InspectorExamPostingListResponse(items=out)


@router.post(
    "/{examination_id}/inspector-postings",
    response_model=InspectorExamPostingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_inspector_posting(
    examination_id: int,
    session: DBSessionDep,
    admin: SuperAdminDep,
    body: InspectorExamPostingCreate,
) -> InspectorExamPostingResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    insp = await session.get(User, body.inspector_user_id)
    if insp is None or insp.role != UserRole.INSPECTOR:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="inspector_user_id must be an inspector")
    await assert_centre_host_school(session, body.center_id)
    scope = ExamInspectorSubjectScope(body.subject_scope.value)
    await validate_new_posting_no_overlap(
        session,
        examination_id=examination_id,
        inspector_user_id=body.inspector_user_id,
        center_id=body.center_id,
        subject_scope=scope,
    )
    row = InspectorExamPosting(
        examination_id=examination_id,
        inspector_user_id=body.inspector_user_id,
        center_id=body.center_id,
        subject_scope=scope,
        notes=body.notes,
        created_by_user_id=admin.id,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    center = await session.get(School, row.center_id)
    assert center is not None
    return _posting_to_response(row, center, insp)


@router.get(
    "/{examination_id}/inspector-postings/bulk-upload/template",
    summary="Download Excel template for inspector postings bulk upload",
)
async def download_inspector_postings_bulk_template(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> Response:
    """Single-sheet Excel file with columns: phone_number, full_name, password, core, elective."""
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    body = generate_inspector_postings_bulk_template()
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="inspector_postings_bulk_template.xlsx"'},
    )


@router.post(
    "/{examination_id}/inspector-postings/bulk-upload",
    response_model=InspectorPostingBulkUploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk-create inspector postings from CSV or Excel (CORE / ELECTIVE centre codes per row)",
)
async def bulk_upload_inspector_postings(
    examination_id: int,
    session: DBSessionDep,
    admin: SuperAdminDep,
    file: UploadFile = File(...),
) -> InspectorPostingBulkUploadResponse:
    """Requires ``phone_number``, ``full_name``; optional ``core`` / ``elective`` host centre codes; optional ``password`` (required when creating a new inspector).

    Creates inspector accounts when missing (unique by phone). At least one of ``core`` or ``elective`` must be set per row.
    """
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    content = await file.read()
    try:
        df = read_upload_as_dataframe(content, file.filename or "", all_columns_as_string=True)
        df = normalize_column_names(df)
        validate_inspector_posting_bulk_required_columns(df)
    except SchoolUploadParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    errors: list[InspectorPostingBulkUploadError] = []
    created_inspectors: list[InspectorPostingBulkCreatedInspectorRow] = []
    created_postings: list[InspectorPostingBulkCreatedPostingRow] = []
    successful = 0
    failed = 0

    for i, (_, row) in enumerate(df.iterrows()):
        row_number = i + 2
        try:
            phone_number = parse_inspector_phone_number(row.get("phone_number"))
            full_name = parse_inspector_full_name(row.get("full_name"))
            password_optional = parse_optional_inspector_password(
                row.get("password"),
                min_length=settings.password_min_length,
            )
            core_code = parse_optional_examination_centre_host_code(row.get("core"))
            elective_code = parse_optional_examination_centre_host_code(row.get("elective"))
        except ValueError as exc:
            errors.append(InspectorPostingBulkUploadError(row_number=row_number, error_message=str(exc)))
            failed += 1
            continue

        if not core_code and not elective_code:
            errors.append(
                InspectorPostingBulkUploadError(
                    row_number=row_number,
                    error_message="At least one of core or elective centre code is required",
                )
            )
            failed += 1
            continue

        row_new_inspectors: list[InspectorPostingBulkCreatedInspectorRow] = []
        row_new_postings: list[InspectorPostingBulkCreatedPostingRow] = []

        try:
            insp_stmt = select(User).where(
                User.role == UserRole.INSPECTOR,
                User.phone_number == phone_number,
            )
            insp_result = await session.execute(insp_stmt)
            inspector = insp_result.scalar_one_or_none()
            if inspector is None:
                if not password_optional:
                    raise ValueError(
                        "password is required in this row when the inspector account does not exist yet"
                    )
                user = User(
                    school_code=None,
                    phone_number=phone_number,
                    full_name=full_name,
                    role=UserRole.INSPECTOR,
                    hashed_password=get_password_hash(password_optional),
                    is_active=True,
                )
                session.add(user)
                await session.flush()
                inspector = user
                row_new_inspectors.append(
                    InspectorPostingBulkCreatedInspectorRow(
                        row_number=row_number,
                        phone_number=phone_number,
                        full_name=full_name,
                    )
                )

            posting_rows = await create_inspector_postings_from_core_elective_codes(
                session,
                examination_id=examination_id,
                inspector_user_id=inspector.id,
                core_code=core_code,
                elective_code=elective_code,
                created_by_user_id=admin.id,
                notes=None,
            )
            for posting, inserted in posting_rows:
                if not inserted:
                    continue
                sch = await session.get(School, posting.center_id)
                if sch is None:
                    continue
                st_scope = posting.subject_scope
                scope_str = st_scope.value if isinstance(st_scope, ExamInspectorSubjectScope) else str(st_scope)
                row_new_postings.append(
                    InspectorPostingBulkCreatedPostingRow(
                        row_number=row_number,
                        inspector_user_id=inspector.id,
                        center_code=cast(str, sch.code),
                        subject_scope=scope_str,
                    )
                )

            await session.commit()
        except ValueError as exc:
            await session.rollback()
            errors.append(InspectorPostingBulkUploadError(row_number=row_number, error_message=str(exc)))
            failed += 1
        except IntegrityError:
            await session.rollback()
            errors.append(
                InspectorPostingBulkUploadError(
                    row_number=row_number,
                    error_message="Could not save row (constraint violation)",
                )
            )
            failed += 1
        except HTTPException as exc:
            await session.rollback()
            errors.append(
                InspectorPostingBulkUploadError(row_number=row_number, error_message=cast(str, exc.detail))
            )
            failed += 1
        else:
            created_inspectors.extend(row_new_inspectors)
            created_postings.extend(row_new_postings)
            successful += 1

    return InspectorPostingBulkUploadResponse(
        total_rows=len(df),
        successful=successful,
        failed=failed,
        errors=errors,
        created_inspectors=created_inspectors,
        created_postings=created_postings,
    )


@router.patch(
    "/{examination_id}/inspector-postings/{posting_id}",
    response_model=InspectorExamPostingResponse,
)
async def update_inspector_posting(
    examination_id: int,
    posting_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
    body: InspectorExamPostingUpdate,
) -> InspectorExamPostingResponse:
    try:
        await load_examination_or_raise(session, examination_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found") from None

    row = await session.get(InspectorExamPosting, posting_id)
    if row is None or row.examination_id != examination_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posting not found")

    center_id = body.center_id if body.center_id is not None else row.center_id
    scope = (
        ExamInspectorSubjectScope(body.subject_scope.value)
        if body.subject_scope is not None
        else (
            row.subject_scope
            if isinstance(row.subject_scope, ExamInspectorSubjectScope)
            else ExamInspectorSubjectScope(str(row.subject_scope))
        )
    )
    if body.center_id is not None:
        await assert_centre_host_school(session, body.center_id)

    if body.center_id is not None or body.subject_scope is not None:
        await validate_new_posting_no_overlap(
            session,
            examination_id=examination_id,
            inspector_user_id=row.inspector_user_id,
            center_id=center_id,
            subject_scope=scope,
            exclude_posting_id=posting_id,
        )

    if body.center_id is not None:
        row.center_id = body.center_id
    if body.subject_scope is not None:
        row.subject_scope = scope
    if body.notes is not None:
        row.notes = body.notes

    await session.commit()
    await session.refresh(row)
    center = await session.get(School, row.center_id)
    insp = await session.get(User, row.inspector_user_id)
    assert center is not None and insp is not None
    return _posting_to_response(row, center, insp)


@router.delete(
    "/{examination_id}/inspector-postings/{posting_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_inspector_posting(
    examination_id: int,
    posting_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    row = await session.get(InspectorExamPosting, posting_id)
    if row is None or row.examination_id != examination_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posting not found")
    await session.delete(row)
    await session.commit()
