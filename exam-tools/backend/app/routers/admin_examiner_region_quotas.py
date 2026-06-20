"""Admin: per-subject regional examiner roster quotas."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationExaminerQuotaRegionGroup, Subject
from app.schemas.subject_examiner_region_quota import (
    SubjectExaminerRegionQuotaReplace,
    SubjectExaminerRegionQuotasResponse,
)
from app.services.examiner_regional_quota import (
    build_subject_quota_status_response,
    replace_quotas_for_subject,
    upsert_quota_settings_for_subject,
)

router = APIRouter(prefix="/admin/examinations", tags=["admin-examiner-region-quotas"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


async def _load_subject(session: DBSessionDep, subject_id: int) -> Subject:
    sub = await session.get(Subject, subject_id)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return sub


async def _quotas_response(
    session: DBSessionDep,
    exam_id: int,
    subject_id: int,
) -> SubjectExaminerRegionQuotasResponse:
    return await build_subject_quota_status_response(
        session,
        examination_id=exam_id,
        subject_id=subject_id,
    )


@router.get(
    "/{exam_id}/subjects/{subject_id}/examiner-region-quotas",
    response_model=SubjectExaminerRegionQuotasResponse,
)
async def get_subject_examiner_region_quotas(
    exam_id: int,
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> SubjectExaminerRegionQuotasResponse:
    await _load_examination(session, exam_id)
    await _load_subject(session, subject_id)
    return await _quotas_response(session, exam_id, subject_id)


@router.put(
    "/{exam_id}/subjects/{subject_id}/examiner-region-quotas",
    response_model=SubjectExaminerRegionQuotasResponse,
)
async def put_subject_examiner_region_quotas(
    exam_id: int,
    subject_id: int,
    body: SubjectExaminerRegionQuotaReplace,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> SubjectExaminerRegionQuotasResponse:
    await _load_examination(session, exam_id)
    await _load_subject(session, subject_id)

    stmt = select(ExaminationExaminerQuotaRegionGroup.id).where(
        ExaminationExaminerQuotaRegionGroup.examination_id == exam_id
    )
    valid_group_ids = {row[0] for row in (await session.execute(stmt)).all()}

    from app.models import ExaminerType

    items: list[tuple[UUID, ExaminerType | None, int]] = []
    group_totals: dict[UUID, int] = {}
    for item in body.items:
        if item.group_id not in valid_group_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Region group {item.group_id} does not belong to this examination.",
            )
        et = None
        if item.examiner_type is not None:
            et = ExaminerType(item.examiner_type.value)
        items.append((item.group_id, et, item.quota_count))
        if et is None:
            group_totals[item.group_id] = item.quota_count

    if body.total_quota is not None:
        if not valid_group_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Configure quota region groups before setting subject quotas.",
            )
        missing_groups = valid_group_ids - set(group_totals.keys())
        if missing_groups:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Every region group must have a total cap when a subject total is set.",
            )
        allocated = sum(group_totals.values())
        if allocated != body.total_quota:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Regional group caps must sum to the subject total "
                    f"({allocated} allocated, {body.total_quota} required)."
                ),
            )

    await upsert_quota_settings_for_subject(
        session,
        examination_id=exam_id,
        subject_id=subject_id,
        total_quota=body.total_quota,
        male_quota=body.male_quota,
        female_quota=body.female_quota,
    )
    await replace_quotas_for_subject(
        session,
        examination_id=exam_id,
        subject_id=subject_id,
        items=items,
    )
    await session.commit()
    return await _quotas_response(session, exam_id, subject_id)
