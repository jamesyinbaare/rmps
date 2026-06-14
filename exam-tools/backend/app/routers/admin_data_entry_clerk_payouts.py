"""Finance: data entry clerk payout list and BoG export."""

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.workforce import WorkforcePayoutListResponse, WorkforcePayoutRow
from app.services.workforce_payout import (
    data_entry_clerk_bog_export_filename,
    data_entry_clerk_bog_workbook_bytes,
    list_data_entry_clerk_payouts,
)

router = APIRouter(prefix="/admin/data-entry-clerk-payouts", tags=["admin-data-entry-clerk-payouts"])


@router.get("", response_model=WorkforcePayoutListResponse)
async def admin_list_data_entry_clerk_payouts(
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
) -> WorkforcePayoutListResponse:
    try:
        data = await list_data_entry_clerk_payouts(session, examination_id=examination_id)
    except ValueError as exc:
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforcePayoutListResponse(
        items=[WorkforcePayoutRow(**item) for item in data["items"]],
        total=data["total"],
    )


@router.get("/bog-export.xlsx")
async def admin_bog_export_data_entry_clerk_payouts(
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
) -> Response:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    try:
        data = await list_data_entry_clerk_payouts(session, examination_id=examination_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not data["items"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No data entry clerks found for this examination.",
        )

    payload = data_entry_clerk_bog_workbook_bytes(exam, data["items"])
    filename = data_entry_clerk_bog_export_filename(exam)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
