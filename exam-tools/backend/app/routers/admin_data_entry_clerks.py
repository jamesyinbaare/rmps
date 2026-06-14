"""Admin roster CRUD for data entry clerks."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.schemas.workforce import (
    WorkforceBulkInviteSmsRequest,
    WorkforceBulkInviteSmsResponse,
    WorkforceInviteSmsResult,
    WorkforceRosterCreate,
    WorkforceRosterResponse,
    WorkforceRosterUpdate,
)
from app.services.sms.workforce_portal_sms import maybe_send_data_entry_clerk_invite_sms
from app.services.workforce_roster import (
    WorkforceRosterNotFoundError,
    create_data_entry_clerk,
    delete_data_entry_clerk,
    get_data_entry_clerk_or_404,
    list_data_entry_clerks,
    update_data_entry_clerk,
)

router = APIRouter(
    prefix="/admin/examinations/{examination_id}/data-entry-clerks",
    tags=["admin-data-entry-clerks"],
)


@router.get("", response_model=list[WorkforceRosterResponse])
async def list_admin_data_entry_clerks(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
) -> list[WorkforceRosterResponse]:
    rows = await list_data_entry_clerks(session, examination_id)
    return [WorkforceRosterResponse(**row) for row in rows]


@router.post("", response_model=WorkforceRosterResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_data_entry_clerk(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    body: WorkforceRosterCreate,
    send_sms: bool = Query(False, description="Send portal invite SMS after create"),
) -> WorkforceRosterResponse:
    try:
        row = await create_data_entry_clerk(session, examination_id=examination_id, body=body)
        if send_sms:
            clerk = await get_data_entry_clerk_or_404(
                session, examination_id=examination_id, clerk_id=row["id"]
            )
            await maybe_send_data_entry_clerk_invite_sms(
                session,
                clerk,
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


@router.get("/{clerk_id}", response_model=WorkforceRosterResponse)
async def get_admin_data_entry_clerk(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    clerk_id: UUID,
) -> WorkforceRosterResponse:
    try:
        clerk = await get_data_entry_clerk_or_404(
            session, examination_id=examination_id, clerk_id=clerk_id
        )
    except WorkforceRosterNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    from app.services.workforce_roster import data_entry_clerk_to_dict

    return WorkforceRosterResponse(**data_entry_clerk_to_dict(clerk))


@router.patch("/{clerk_id}", response_model=WorkforceRosterResponse)
async def update_admin_data_entry_clerk(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    clerk_id: UUID,
    body: WorkforceRosterUpdate,
) -> WorkforceRosterResponse:
    try:
        row = await update_data_entry_clerk(
            session,
            examination_id=examination_id,
            clerk_id=clerk_id,
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


@router.delete("/{clerk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_data_entry_clerk(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    clerk_id: UUID,
) -> None:
    try:
        await delete_data_entry_clerk(session, examination_id=examination_id, clerk_id=clerk_id)
        await session.commit()
    except WorkforceRosterNotFoundError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{clerk_id}/send-invite-sms", response_model=WorkforceInviteSmsResult)
async def send_admin_data_entry_clerk_invite_sms(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    clerk_id: UUID,
) -> WorkforceInviteSmsResult:
    try:
        clerk = await get_data_entry_clerk_or_404(
            session, examination_id=examination_id, clerk_id=clerk_id
        )
        result, _ = await maybe_send_data_entry_clerk_invite_sms(
            session,
            clerk,
            trigger="admin_single",
            triggered_by_user_id=user.id,
        )
    except WorkforceRosterNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return WorkforceInviteSmsResult(id=clerk_id, sent=result.sent, error=result.error)


@router.post("/bulk-invite-sms", response_model=WorkforceBulkInviteSmsResponse)
async def bulk_send_admin_data_entry_clerk_invite_sms(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    body: WorkforceBulkInviteSmsRequest,
) -> WorkforceBulkInviteSmsResponse:
    results: list[WorkforceInviteSmsResult] = []
    sent_count = 0
    failed_count = 0
    for clerk_id in body.ids:
        try:
            clerk = await get_data_entry_clerk_or_404(
                session, examination_id=examination_id, clerk_id=clerk_id
            )
            result, _ = await maybe_send_data_entry_clerk_invite_sms(
                session,
                clerk,
                trigger="admin_bulk",
                triggered_by_user_id=user.id,
            )
        except WorkforceRosterNotFoundError:
            results.append(
                WorkforceInviteSmsResult(
                    id=clerk_id,
                    sent=False,
                    error="Data entry clerk not found",
                )
            )
            failed_count += 1
            continue
        if result.sent:
            sent_count += 1
        else:
            failed_count += 1
        results.append(WorkforceInviteSmsResult(id=clerk_id, sent=result.sent, error=result.error))
    return WorkforceBulkInviteSmsResponse(
        results=results,
        sent_count=sent_count,
        failed_count=failed_count,
    )
