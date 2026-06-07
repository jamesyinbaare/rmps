from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from app.dependencies.database import DBSessionDep
from app.schemas.bank_branch import BankBranchListResponse, BankBranchRow
from app.schemas.examiner_bank_account import ExaminerBankAccountResponse, ExaminerBankAccountUpsert
from app.schemas.examiner_invitation import (
    ExaminerInvitationActionResponse,
    ExaminerInvitationPublicResponse,
    ExaminerInvitationStatusSchema,
)
from app.schemas.examiner_public_profile import ExaminerPublicScriptsAllocationResponse
from app.services.bank_branch_query import DEFAULT_LIMIT, MAX_LIST, distinct_bank_names, list_bank_branches
from app.services.examiner_appointment_letter_pdf import build_examiner_appointment_letter_pdf
from app.services.examiner_bank_account import (
    bank_account_to_dict,
    get_by_examiner_id,
    require_accepted_invitation_for_bank,
    upsert_for_examiner,
)
from app.services.examiner_invitation import (
    _is_publicly_accessible,
    accept_examiner_invitation,
    decline_examiner_invitation,
    get_invitation_by_token,
    public_invitation_view,
)
from app.services.examiner_public_profile import get_scripts_allocation_for_invitation

router = APIRouter(prefix="/public/examiner-invitations", tags=["public-examiner-invitations"])


def _sanitize_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))


async def _resolve_public_invitation(session: DBSessionDep, token: str):
    inv = await get_invitation_by_token(session, token)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    prev_status = inv.status
    if not _is_publicly_accessible(inv):
        if inv.status != prev_status:
            await session.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation is no longer available.",
        )
    if inv.status != prev_status:
        await session.commit()
    return inv


async def _resolve_accepted_for_bank(session: DBSessionDep, token: str):
    inv = await _resolve_public_invitation(session, token)
    try:
        examiner_id = require_accepted_invitation_for_bank(inv)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return inv, examiner_id


@router.get("/{token}", response_model=ExaminerInvitationPublicResponse)
async def get_public_examiner_invitation(
    session: DBSessionDep,
    token: str,
) -> ExaminerInvitationPublicResponse:
    inv = await get_invitation_by_token(session, token)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    prev_status = inv.status
    summary = public_invitation_view(inv)
    if inv.status != prev_status:
        await session.commit()
    if not _is_publicly_accessible(inv):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation is no longer available.",
        )
    return ExaminerInvitationPublicResponse(**summary)


@router.post("/{token}/accept", response_model=ExaminerInvitationActionResponse)
async def accept_public_examiner_invitation(
    session: DBSessionDep,
    token: str,
) -> ExaminerInvitationActionResponse:
    inv = await get_invitation_by_token(session, token)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    try:
        examiner = await accept_examiner_invitation(session, inv)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ExaminerInvitationActionResponse(
        status=ExaminerInvitationStatusSchema.accepted,
        message="Thank you for confirming your availability.",
        examiner_id=examiner.id,
    )


@router.post("/{token}/decline", response_model=ExaminerInvitationActionResponse)
async def decline_public_examiner_invitation(
    session: DBSessionDep,
    token: str,
) -> ExaminerInvitationActionResponse:
    inv = await get_invitation_by_token(session, token)
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    try:
        await decline_examiner_invitation(session, inv)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ExaminerInvitationActionResponse(
        status=ExaminerInvitationStatusSchema.declined,
        message="Your response has been recorded.",
        examiner_id=None,
    )


@router.get("/{token}/bank-account", response_model=ExaminerBankAccountResponse)
async def get_public_examiner_bank_account(
    session: DBSessionDep,
    token: str,
) -> ExaminerBankAccountResponse:
    _inv, examiner_id = await _resolve_accepted_for_bank(session, token)
    row = await get_by_examiner_id(session, examiner_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No bank account on file.")
    return ExaminerBankAccountResponse(**bank_account_to_dict(row))


@router.put("/{token}/bank-account", response_model=ExaminerBankAccountResponse)
async def upsert_public_examiner_bank_account(
    session: DBSessionDep,
    token: str,
    body: ExaminerBankAccountUpsert,
) -> ExaminerBankAccountResponse:
    _inv, examiner_id = await _resolve_accepted_for_bank(session, token)
    try:
        row = await upsert_for_examiner(
            session,
            examiner_id=examiner_id,
            bank_branch_id=body.bank_branch_id,
            account_number=body.account_number,
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ExaminerBankAccountResponse(**bank_account_to_dict(row))


@router.get("/{token}/bank-branches", response_model=BankBranchListResponse)
async def list_public_bank_branches(
    session: DBSessionDep,
    token: str,
    bank_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    bank_name_exact: str | None = Query(None, description="Exact bank name match (case-sensitive)"),
    branch_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIST),
) -> BankBranchListResponse:
    await _resolve_accepted_for_bank(session, token)
    rows, total = await list_bank_branches(
        session,
        bank_name=bank_name,
        bank_name_exact=bank_name_exact,
        branch_name=branch_name,
        skip=skip,
        limit=limit,
    )
    items = [BankBranchRow.model_validate(r) for r in rows]
    return BankBranchListResponse(items=items, total=total)


@router.get("/{token}/bank-names", response_model=list[str])
async def list_public_bank_names(
    session: DBSessionDep,
    token: str,
    q: str | None = Query(None, description="Substring filter on bank name"),
    limit: int = Query(100, ge=1, le=500),
) -> list[str]:
    await _resolve_accepted_for_bank(session, token)
    return await distinct_bank_names(session, q=q, limit=limit)


@router.get("/{token}/scripts-allocation", response_model=ExaminerPublicScriptsAllocationResponse)
async def get_public_examiner_scripts_allocation(
    session: DBSessionDep,
    token: str,
) -> ExaminerPublicScriptsAllocationResponse:
    inv = await _resolve_public_invitation(session, token)
    try:
        data = await get_scripts_allocation_for_invitation(session, inv)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return ExaminerPublicScriptsAllocationResponse(**data)


@router.get("/{token}/appointment-letter.pdf")
async def download_public_examiner_appointment_letter_pdf(
    session: DBSessionDep,
    token: str,
) -> Response:
    inv = await _resolve_public_invitation(session, token)
    try:
        require_accepted_invitation_for_bank(inv)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    try:
        pdf, filename = await build_examiner_appointment_letter_pdf(inv)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    safe = _sanitize_filename_part(filename.replace(".pdf", "")) + ".pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )
