"""Admin per-examination workforce rates."""

from fastapi import APIRouter, HTTPException, status

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.schemas.workforce import WorkforceRatesPut, WorkforceRatesResponse
from app.services.workforce_rates import (
    get_data_entry_clerk_rates,
    get_script_checker_rates,
    put_data_entry_clerk_rates,
    put_script_checker_rates,
)

router = APIRouter(prefix="/admin/examinations", tags=["admin-workforce-rates"])


@router.get("/{exam_id}/script-checker-rates", response_model=WorkforceRatesResponse)
async def get_admin_script_checker_rates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> WorkforceRatesResponse:
    try:
        data = await get_script_checker_rates(session, exam_id)
    except ValueError as exc:
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceRatesResponse(**data)


@router.put("/{exam_id}/script-checker-rates", response_model=WorkforceRatesResponse)
async def put_admin_script_checker_rates(
    exam_id: int,
    body: WorkforceRatesPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> WorkforceRatesResponse:
    try:
        data = await put_script_checker_rates(session, exam_id, body)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceRatesResponse(**data)


@router.get("/{exam_id}/data-entry-clerk-rates", response_model=WorkforceRatesResponse)
async def get_admin_data_entry_clerk_rates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> WorkforceRatesResponse:
    try:
        data = await get_data_entry_clerk_rates(session, exam_id)
    except ValueError as exc:
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceRatesResponse(**data)


@router.put("/{exam_id}/data-entry-clerk-rates", response_model=WorkforceRatesResponse)
async def put_admin_data_entry_clerk_rates(
    exam_id: int,
    body: WorkforceRatesPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> WorkforceRatesResponse:
    try:
        data = await put_data_entry_clerk_rates(session, exam_id, body)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforceRatesResponse(**data)
