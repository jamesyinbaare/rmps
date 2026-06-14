"""Finance: script checker payout list and BoG export."""

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.workforce import WorkforcePayoutListResponse, WorkforcePayoutRow
from app.services.workforce_payout import (
    list_script_checker_payouts,
    script_checker_bog_export_filename,
    script_checker_bog_workbook_bytes,
)

router = APIRouter(prefix="/admin/script-checker-payouts", tags=["admin-script-checker-payouts"])


@router.get("", response_model=WorkforcePayoutListResponse)
async def admin_list_script_checker_payouts(
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
) -> WorkforcePayoutListResponse:
    try:
        data = await list_script_checker_payouts(session, examination_id=examination_id)
    except ValueError as exc:
        if str(exc) == "Examination not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WorkforcePayoutListResponse(
        items=[WorkforcePayoutRow(**item) for item in data["items"]],
        total=data["total"],
    )


@router.get("/bog-export.xlsx")
async def admin_bog_export_script_checker_payouts(
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
) -> Response:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    try:
        data = await list_script_checker_payouts(session, examination_id=examination_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not data["items"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No script checkers found for this examination.",
        )

    payload = script_checker_bog_workbook_bytes(exam, data["items"])
    filename = script_checker_bog_export_filename(exam)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
