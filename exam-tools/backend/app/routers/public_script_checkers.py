"""Public token portal for script checkers."""

from __future__ import annotations

import io

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.dependencies.database import DBSessionDep
from app.models import WorkforceKind
from app.schemas.bank_branch import BankBranchListResponse, BankBranchRow
from app.schemas.workforce import (
    WorkforceAvailabilityActionResponse,
    WorkforceAvailabilityStatusSchema,
    WorkforceBankAccountResponse,
    WorkforceBankAccountUpsert,
    WorkforcePublicPortalResponse,
)
from app.services.workforce_appointment_letter_pdf import (
    WorkforceAppointmentLetterError,
    build_workforce_appointment_letter_pdf,
)
from app.services.workforce_availability import (
    confirm_workforce_availability,
    decline_workforce_availability,
    require_workforce_portal_access,
)
from app.services.bank_branch_query import (
    DEFAULT_LIMIT,
    MAX_LIST,
    distinct_bank_names,
    list_bank_branches,
)
from app.services.workforce_bank_account import (
    get_script_checker_bank_account,
    script_checker_bank_account_to_dict,
    upsert_script_checker_bank_account,
)
from app.services.workforce_portal import (
    public_script_checker_portal_view,
    resolve_script_checker_by_token,
)

router = APIRouter(prefix="/public/script-checkers", tags=["public-script-checkers"])


async def _resolve_checker_or_404(session: DBSessionDep, token: str):
    checker = await resolve_script_checker_by_token(session, token)
    if checker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal link not found")
    return checker


@router.get("/{token}", response_model=WorkforcePublicPortalResponse)
async def get_public_script_checker_profile(
    session: DBSessionDep,
    token: str,
) -> WorkforcePublicPortalResponse:
    checker = await _resolve_checker_or_404(session, token)
    data = await public_script_checker_portal_view(session, checker)
    return WorkforcePublicPortalResponse(**data)


@router.post("/{token}/accept", response_model=WorkforceAvailabilityActionResponse)
async def accept_public_script_checker_availability(
    session: DBSessionDep,
    token: str,
) -> WorkforceAvailabilityActionResponse:
    checker = await _resolve_checker_or_404(session, token)
    try:
        await confirm_workforce_availability(session, checker)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAvailabilityActionResponse(
        status=WorkforceAvailabilityStatusSchema.confirmed,
        message="Thank you for confirming your availability.",
    )


@router.post("/{token}/decline", response_model=WorkforceAvailabilityActionResponse)
async def decline_public_script_checker_availability(
    session: DBSessionDep,
    token: str,
) -> WorkforceAvailabilityActionResponse:
    checker = await _resolve_checker_or_404(session, token)
    try:
        await decline_workforce_availability(session, checker)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAvailabilityActionResponse(
        status=WorkforceAvailabilityStatusSchema.declined,
        message="Your response has been recorded. Please contact the exam office if your plans change.",
    )


@router.get("/{token}/appointment-letter.pdf")
async def get_public_script_checker_appointment_letter_pdf(
    session: DBSessionDep,
    token: str,
) -> StreamingResponse:
    checker = await _resolve_checker_or_404(session, token)
    try:
        require_workforce_portal_access(checker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    try:
        pdf_bytes, filename = await build_workforce_appointment_letter_pdf(
            session, checker, WorkforceKind.SCRIPT_CHECKER
        )
    except (ValueError, WorkforceAppointmentLetterError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{token}/bank-account", response_model=WorkforceBankAccountResponse)
async def get_public_script_checker_bank_account(
    session: DBSessionDep,
    token: str,
) -> WorkforceBankAccountResponse:
    checker = await _resolve_checker_or_404(session, token)
    try:
        require_workforce_portal_access(checker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    row = await get_script_checker_bank_account(session, checker.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No bank account on file.")
    return WorkforceBankAccountResponse(**script_checker_bank_account_to_dict(row))


@router.put("/{token}/bank-account", response_model=WorkforceBankAccountResponse)
async def upsert_public_script_checker_bank_account(
    session: DBSessionDep,
    token: str,
    body: WorkforceBankAccountUpsert,
) -> WorkforceBankAccountResponse:
    checker = await _resolve_checker_or_404(session, token)
    try:
        require_workforce_portal_access(checker)
        from app.models import WorkforceKind
        from app.services.workforce_portal_release import is_bank_details_editable_for_person

        editable = await is_bank_details_editable_for_person(
            session,
            examination_id=int(checker.examination_id),
            kind=WorkforceKind.SCRIPT_CHECKER,
            person_id=checker.id,
        )
        if not editable:
            raise ValueError("Bank details entry has been disabled by the examination office.")
        row = await upsert_script_checker_bank_account(
            session,
            checker_id=checker.id,
            bank_branch_id=body.bank_branch_id,
            account_number=body.account_number,
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        lowered = str(exc).lower()
        code = (
            status.HTTP_403_FORBIDDEN
            if "confirm your availability" in lowered or "disabled by the examination office" in lowered
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    return WorkforceBankAccountResponse(**script_checker_bank_account_to_dict(row))


@router.get("/{token}/bank-branches", response_model=BankBranchListResponse)
async def list_public_script_checker_bank_branches(
    session: DBSessionDep,
    token: str,
    bank_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    bank_name_exact: str | None = Query(None, description="Exact bank name match (case-sensitive)"),
    branch_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIST),
) -> BankBranchListResponse:
    checker = await _resolve_checker_or_404(session, token)
    try:
        require_workforce_portal_access(checker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
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
async def list_public_script_checker_bank_names(
    session: DBSessionDep,
    token: str,
    q: str | None = Query(None, description="Substring filter on bank name"),
    limit: int = Query(100, ge=1, le=500),
) -> list[str]:
    checker = await _resolve_checker_or_404(session, token)
    try:
        require_workforce_portal_access(checker)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return await distinct_bank_names(session, q=q, limit=limit)
