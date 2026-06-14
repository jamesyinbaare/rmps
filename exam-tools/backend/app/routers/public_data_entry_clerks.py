"""Public token portal for data entry clerks."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.database import DBSessionDep
from app.schemas.bank_branch import BankBranchListResponse, BankBranchRow
from app.schemas.workforce import (
    WorkforceAvailabilityActionResponse,
    WorkforceAvailabilityStatusSchema,
    WorkforceBankAccountResponse,
    WorkforceBankAccountUpsert,
    WorkforcePublicPortalResponse,
)
from app.services.bank_branch_query import (
    DEFAULT_LIMIT,
    MAX_LIST,
    distinct_bank_names,
    list_bank_branches,
)
from app.services.workforce_availability import (
    confirm_workforce_availability,
    decline_workforce_availability,
    require_workforce_portal_access,
)
from app.services.workforce_bank_account import (
    data_entry_clerk_bank_account_to_dict,
    get_data_entry_clerk_bank_account,
    upsert_data_entry_clerk_bank_account,
)
from app.services.workforce_portal import (
    public_data_entry_clerk_portal_view,
    resolve_data_entry_clerk_by_token,
)

router = APIRouter(prefix="/public/data-entry-clerks", tags=["public-data-entry-clerks"])


async def _resolve_clerk_or_404(session: DBSessionDep, token: str):
    clerk = await resolve_data_entry_clerk_by_token(session, token)
    if clerk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal link not found")
    return clerk


@router.get("/{token}", response_model=WorkforcePublicPortalResponse)
async def get_public_data_entry_clerk_profile(
    session: DBSessionDep,
    token: str,
) -> WorkforcePublicPortalResponse:
    clerk = await _resolve_clerk_or_404(session, token)
    data = await public_data_entry_clerk_portal_view(session, clerk)
    return WorkforcePublicPortalResponse(**data)


@router.post("/{token}/accept", response_model=WorkforceAvailabilityActionResponse)
async def accept_public_data_entry_clerk_availability(
    session: DBSessionDep,
    token: str,
) -> WorkforceAvailabilityActionResponse:
    clerk = await _resolve_clerk_or_404(session, token)
    try:
        await confirm_workforce_availability(session, clerk)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAvailabilityActionResponse(
        status=WorkforceAvailabilityStatusSchema.confirmed,
        message="Thank you for confirming your availability.",
    )


@router.post("/{token}/decline", response_model=WorkforceAvailabilityActionResponse)
async def decline_public_data_entry_clerk_availability(
    session: DBSessionDep,
    token: str,
) -> WorkforceAvailabilityActionResponse:
    clerk = await _resolve_clerk_or_404(session, token)
    try:
        await decline_workforce_availability(session, clerk)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceAvailabilityActionResponse(
        status=WorkforceAvailabilityStatusSchema.declined,
        message="Your response has been recorded. Please contact the exam office if your plans change.",
    )


@router.get("/{token}/bank-account", response_model=WorkforceBankAccountResponse)
async def get_public_data_entry_clerk_bank_account(
    session: DBSessionDep,
    token: str,
) -> WorkforceBankAccountResponse:
    clerk = await _resolve_clerk_or_404(session, token)
    try:
        require_workforce_portal_access(clerk)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    row = await get_data_entry_clerk_bank_account(session, clerk.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No bank account on file.")
    return WorkforceBankAccountResponse(**data_entry_clerk_bank_account_to_dict(row))


@router.put("/{token}/bank-account", response_model=WorkforceBankAccountResponse)
async def upsert_public_data_entry_clerk_bank_account(
    session: DBSessionDep,
    token: str,
    body: WorkforceBankAccountUpsert,
) -> WorkforceBankAccountResponse:
    clerk = await _resolve_clerk_or_404(session, token)
    try:
        require_workforce_portal_access(clerk)
        row = await upsert_data_entry_clerk_bank_account(
            session,
            clerk_id=clerk.id,
            bank_branch_id=body.bank_branch_id,
            account_number=body.account_number,
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        code = status.HTTP_403_FORBIDDEN if "confirm your availability" in str(exc).lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    return WorkforceBankAccountResponse(**data_entry_clerk_bank_account_to_dict(row))


@router.get("/{token}/bank-branches", response_model=BankBranchListResponse)
async def list_public_data_entry_clerk_bank_branches(
    session: DBSessionDep,
    token: str,
    bank_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    bank_name_exact: str | None = Query(None, description="Exact bank name match (case-sensitive)"),
    branch_name: str | None = Query(None, description="Substring match (case-insensitive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIST),
) -> BankBranchListResponse:
    clerk = await _resolve_clerk_or_404(session, token)
    try:
        require_workforce_portal_access(clerk)
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
async def list_public_data_entry_clerk_bank_names(
    session: DBSessionDep,
    token: str,
    q: str | None = Query(None, description="Substring filter on bank name"),
    limit: int = Query(100, ge=1, le=500),
) -> list[str]:
    clerk = await _resolve_clerk_or_404(session, token)
    try:
        require_workforce_portal_access(clerk)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    return await distinct_bank_names(session, q=q, limit=limit)
