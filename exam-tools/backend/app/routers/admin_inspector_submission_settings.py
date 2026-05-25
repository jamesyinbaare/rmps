"""Admin CRUD for per-examination inspector submission settings."""

from fastapi import APIRouter, HTTPException, status

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.inspector_submission_settings import (
    InspectorSubmissionSettingsPut,
    InspectorSubmissionSettingsResponse,
)
from app.services.inspector_submission_settings import (
    get_or_create_submission_settings,
    upsert_submission_settings,
)

router = APIRouter(
    prefix="/admin/examinations/{examination_id}/inspector-submission-settings",
    tags=["admin-inspector-submission-settings"],
)


def _to_response(row) -> InspectorSubmissionSettingsResponse:
    return InspectorSubmissionSettingsResponse(
        examination_id=row.examination_id,
        core_submission_period_start=row.core_submission_period_start,
        core_submission_period_end=row.core_submission_period_end,
        elective_submission_period_start=row.elective_submission_period_start,
        elective_submission_period_end=row.elective_submission_period_end,
        officials_core_enabled=bool(row.officials_core_enabled),
        officials_elective_enabled=bool(row.officials_elective_enabled),
        updated_at=row.updated_at,
    )


@router.get("", response_model=InspectorSubmissionSettingsResponse)
async def get_inspector_submission_settings(
    examination_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> InspectorSubmissionSettingsResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    row = await get_or_create_submission_settings(session, examination_id)
    return _to_response(row)


@router.put("", response_model=InspectorSubmissionSettingsResponse)
async def put_inspector_submission_settings(
    examination_id: int,
    body: InspectorSubmissionSettingsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> InspectorSubmissionSettingsResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    row = await upsert_submission_settings(
        session,
        examination_id,
        core_submission_period_start=body.core_submission_period_start,
        core_submission_period_end=body.core_submission_period_end,
        elective_submission_period_start=body.elective_submission_period_start,
        elective_submission_period_end=body.elective_submission_period_end,
        officials_core_enabled=body.officials_core_enabled,
        officials_elective_enabled=body.officials_elective_enabled,
    )
    return _to_response(row)
