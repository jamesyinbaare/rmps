"""Admin roster CRUD for script checkers."""

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
from app.services.sms.workforce_portal_sms import maybe_send_script_checker_invite_sms
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
