"""Admin-only system settings (active examination for staff)."""

from fastapi import APIRouter, HTTPException, status

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, SystemSettings
from app.schemas.examination import ExaminationResponse
from app.schemas.system_settings import ActiveExaminationAdminResponse, ActiveExaminationPut
from app.services.active_examination import resolve_active_examination_id

router = APIRouter(prefix="/admin/system", tags=["admin-system"])


@router.get("/active-examination", response_model=ActiveExaminationAdminResponse)
async def get_active_examination_settings(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ActiveExaminationAdminResponse:
    row = await session.get(SystemSettings, 1)
    pin = row.active_examination_id if row is not None else None

    resolved_id = await resolve_active_examination_id(session)
    exam = await session.get(Examination, resolved_id)
    if exam is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not resolve active examination",
        )
    return ActiveExaminationAdminResponse(
        active_examination_id=pin,
        resolved_examination_id=resolved_id,
        examination=ExaminationResponse.model_validate(exam),
    )


@router.put("/active-examination", response_model=ActiveExaminationAdminResponse)
async def put_active_examination_settings(
    body: ActiveExaminationPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ActiveExaminationAdminResponse:
    if body.active_examination_id is not None:
        ex = await session.get(Examination, body.active_examination_id)
        if ex is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Examination not found",
            )

    row = await session.get(SystemSettings, 1)
    if row is None:
        row = SystemSettings(id=1, active_examination_id=body.active_examination_id)
        session.add(row)
    else:
        row.active_examination_id = body.active_examination_id

    await session.commit()
    await session.refresh(row)

    resolved_id = await resolve_active_examination_id(session)
    exam = await session.get(Examination, resolved_id)
    if exam is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not resolve active examination",
        )

    return ActiveExaminationAdminResponse(
        active_examination_id=row.active_examination_id,
        resolved_examination_id=resolved_id,
        examination=ExaminationResponse.model_validate(exam),
    )
