"""Admin roster CRUD for script checkers."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import WorkforceKind
from app.schemas.workforce import (
    WorkforceBulkImportResponse,
    WorkforceBulkImportRowError,
    WorkforceBulkInviteSmsRequest,
    WorkforceBulkInviteSmsResponse,
    WorkforceInviteSmsResult,
    WorkforcePortalLinkRegenerateRequest,
    WorkforcePortalLinkRegenerateResponse,
    WorkforceRosterCreate,
    WorkforceRosterResponse,
    WorkforceRosterUpdate,
)
from app.services.sms.workforce_portal_sms import maybe_send_script_checker_invite_sms
from app.services.template_generator import generate_workforce_roster_bulk_template
from app.services.workforce_bulk_upload import (
    bulk_upload_workforce_roster,
    read_workforce_roster_spreadsheet,
)
from app.services.workforce_portal import regenerate_script_checker_portal_link
from app.services.workforce_roster import (
    WorkforceRosterNotFoundError,
    create_script_checker,
    delete_script_checker,
    get_script_checker_or_404,
    list_script_checkers,
    update_script_checker,
)
router = APIRouter(
    prefix="/admin/examinations/{examination_id}/script-checkers",
    tags=["admin-script-checkers"],
)

_MAX_BULK_BYTES = 5 * 1024 * 1024
_MAX_BULK_ROWS = 2000


@router.get("", response_model=list[WorkforceRosterResponse])
async def list_admin_script_checkers(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
) -> list[WorkforceRosterResponse]:
    rows = await list_script_checkers(session, examination_id)
    return [WorkforceRosterResponse(**row) for row in rows]


@router.post("", response_model=WorkforceRosterResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_script_checker(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    body: WorkforceRosterCreate,
    send_sms: bool = Query(False, description="Send portal invite SMS after create"),
) -> WorkforceRosterResponse:
    try:
        row = await create_script_checker(session, examination_id=examination_id, body=body)
        if send_sms:
            checker = await get_script_checker_or_404(
                session, examination_id=examination_id, checker_id=row["id"]
            )
            await maybe_send_script_checker_invite_sms(
                session,
                checker,
                trigger="admin_create",
                triggered_by_user_id=user.id,
            )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceRosterResponse(**row)


@router.get(
    "/bulk-upload/template",
    summary="Download Excel template for script checker roster bulk upload",
)
async def download_script_checker_bulk_upload_template(
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,  # noqa: ARG001
) -> Response:
    body = generate_workforce_roster_bulk_template()
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="script_checkers_bulk_template.xlsx"'},
    )


@router.post("/bulk-upload", response_model=WorkforceBulkImportResponse)
async def bulk_upload_admin_script_checkers(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    file: UploadFile = File(...),
    send_sms: bool = Query(False, description="Send portal invite SMS to newly created rows"),
    availability_deadline: datetime | None = Query(
        None, description="Optional respond-by deadline applied to every created row"
    ),
) -> WorkforceBulkImportResponse:
    raw = await file.read()
    if len(raw) > _MAX_BULK_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    try:
        df = read_workforce_roster_spreadsheet(raw, file.filename or "upload.csv")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if len(df) > _MAX_BULK_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_MAX_BULK_ROWS} data rows are allowed",
        )
    try:
        created_rows, row_errors = await bulk_upload_workforce_roster(
            session,
            examination_id=examination_id,
            kind=WorkforceKind.SCRIPT_CHECKER,
            df=df,
            availability_deadline=availability_deadline,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    if send_sms:
        for row in created_rows:
            try:
                checker = await get_script_checker_or_404(
                    session, examination_id=examination_id, checker_id=row["id"]
                )
                await maybe_send_script_checker_invite_sms(
                    session,
                    checker,
                    trigger="admin_bulk_upload",
                    triggered_by_user_id=user.id,
                )
            except WorkforceRosterNotFoundError:
                continue

    return WorkforceBulkImportResponse(
        created_count=len(created_rows),
        errors=[WorkforceBulkImportRowError(row_number=n, message=m) for n, m in row_errors],
        items=[WorkforceRosterResponse(**row) for row in created_rows],
    )


@router.get("/{checker_id}", response_model=WorkforceRosterResponse)
async def get_admin_script_checker(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    checker_id: UUID,
) -> WorkforceRosterResponse:
    try:
        checker = await get_script_checker_or_404(
            session, examination_id=examination_id, checker_id=checker_id
        )
    except WorkforceRosterNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    from app.services.workforce_roster import script_checker_to_dict

    return WorkforceRosterResponse(**script_checker_to_dict(checker))


@router.patch("/{checker_id}", response_model=WorkforceRosterResponse)
async def update_admin_script_checker(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    checker_id: UUID,
    body: WorkforceRosterUpdate,
) -> WorkforceRosterResponse:
    try:
        row = await update_script_checker(
            session,
            examination_id=examination_id,
            checker_id=checker_id,
            body=body,
        )
        await session.commit()
    except WorkforceRosterNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceRosterResponse(**row)


@router.delete("/{checker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_script_checker(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    checker_id: UUID,
) -> None:
    try:
        await delete_script_checker(session, examination_id=examination_id, checker_id=checker_id)
        await session.commit()
    except WorkforceRosterNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/{checker_id}/regenerate-portal-link",
    response_model=WorkforcePortalLinkRegenerateResponse,
)
async def regenerate_admin_script_checker_portal_link(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    checker_id: UUID,
    body: WorkforcePortalLinkRegenerateRequest,
) -> WorkforcePortalLinkRegenerateResponse:
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set confirm to true to regenerate the portal link.",
        )
    try:
        checker = await get_script_checker_or_404(
            session, examination_id=examination_id, checker_id=checker_id
        )
        portal_url = await regenerate_script_checker_portal_link(session, checker)
        await session.commit()
    except WorkforceRosterNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return WorkforcePortalLinkRegenerateResponse(person_id=checker_id, portal_url=portal_url)


@router.post("/{checker_id}/send-invite-sms", response_model=WorkforceInviteSmsResult)
async def send_admin_script_checker_invite_sms(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    checker_id: UUID,
) -> WorkforceInviteSmsResult:
    try:
        checker = await get_script_checker_or_404(
            session, examination_id=examination_id, checker_id=checker_id
        )
        result, _ = await maybe_send_script_checker_invite_sms(
            session,
            checker,
            trigger="admin_single",
            triggered_by_user_id=user.id,
        )
    except WorkforceRosterNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return WorkforceInviteSmsResult(id=checker_id, sent=result.sent, error=result.error)


@router.post("/bulk-invite-sms", response_model=WorkforceBulkInviteSmsResponse)
async def bulk_send_admin_script_checker_invite_sms(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    body: WorkforceBulkInviteSmsRequest,
) -> WorkforceBulkInviteSmsResponse:
    results: list[WorkforceInviteSmsResult] = []
    sent_count = 0
    failed_count = 0
    for checker_id in body.ids:
        try:
            checker = await get_script_checker_or_404(
                session, examination_id=examination_id, checker_id=checker_id
            )
            result, _ = await maybe_send_script_checker_invite_sms(
                session,
                checker,
                trigger="admin_bulk",
                triggered_by_user_id=user.id,
            )
        except WorkforceRosterNotFoundError:
            results.append(
                WorkforceInviteSmsResult(
                    id=checker_id,
                    sent=False,
                    error="Script checker not found",
                )
            )
            failed_count += 1
            continue
        if result.sent:
            sent_count += 1
        else:
            failed_count += 1
        results.append(WorkforceInviteSmsResult(id=checker_id, sent=result.sent, error=result.error))
    return WorkforceBulkInviteSmsResponse(
        results=results,
        sent_count=sent_count,
        failed_count=failed_count,
    )
