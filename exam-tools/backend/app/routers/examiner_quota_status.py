"""Read-only examiner quota status for subject officers and test admin officers."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies.auth import SuperAdminOrTestAdminOfficerOrSubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, Subject
from app.schemas.subject_examiner_region_quota import (
    QuotaProjectionResponse,
    SubjectExaminerRegionQuotasResponse,
)
from app.services.examiner_regional_quota import (
    build_subject_quota_projection_response,
    build_subject_quota_status_response,
)
from app.services.subject_officer_scope import assert_subject_officer_access, is_unrestricted_examiner_manager

router = APIRouter(tags=["examiner-quota-status"])

ProjectionParam = Literal["current", "pending", "pending_and_waitlisted"]


async def _authorize_quota_status(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    subject_id: int,
) -> None:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    if not is_unrestricted_examiner_manager(user):
        await assert_subject_officer_access(session, user, examination_id, subject_id)


@router.get(
    "/examinations/{examination_id}/subjects/{subject_id}/examiner-quota-status",
    response_model=SubjectExaminerRegionQuotasResponse | QuotaProjectionResponse,
)
async def get_subject_examiner_quota_status(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    projection: ProjectionParam = Query(default="current"),
) -> SubjectExaminerRegionQuotasResponse | QuotaProjectionResponse:
    await _authorize_quota_status(session, user, examination_id, subject_id)

    if projection == "current":
        return await build_subject_quota_status_response(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
        )

    return await build_subject_quota_projection_response(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        scenario=projection,
    )
