"""Admin: per-subject regional examiner roster quotas."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationExaminerQuotaRegionGroup, Subject, SubjectExaminerRegionQuota
from app.schemas.examination_examiner_quota_region_group import ExaminerQuotaRegionGroupRow
from app.schemas.script_allocation import ExaminerTypeSchema
from app.schemas.subject_examiner_region_quota import (
    SubjectExaminerGenderQuotaSummaryRow,
    SubjectExaminerRegionQuotaItem,
    SubjectExaminerRegionQuotaReplace,
    SubjectExaminerRegionQuotaSummaryRow,
    SubjectExaminerRegionQuotasResponse,
)
from app.services.examiner_invitation import _examiner_type_label
from app.services.examiner_regional_quota import (
    count_gender_distribution,
    count_roster_distribution,
    get_quota_settings_for_subject,
    list_quotas_for_subject,
    replace_quotas_for_subject,
    upsert_quota_settings_for_subject,
)
from app.services.examiner_roster import parse_region

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


def _group_rows(groups: list[ExaminationExaminerQuotaRegionGroup]) -> list[ExaminerQuotaRegionGroupRow]:
    from app.models import Region

    return [
        ExaminerQuotaRegionGroupRow(
            id=group.id,
            name=group.name,
            regions=sorted(
                r.region.value if isinstance(r.region, Region) else str(r.region) for r in group.regions
            ),
        )
        for group in sorted(groups, key=lambda g: g.name.lower())
    ]


def _quota_items(quotas: list[SubjectExaminerRegionQuota]) -> list[SubjectExaminerRegionQuotaItem]:
    from app.models import ExaminerType

    items: list[SubjectExaminerRegionQuotaItem] = []
    for q in quotas:
        et = None
        if q.examiner_type is not None:
            et = ExaminerTypeSchema(q.examiner_type.value if isinstance(q.examiner_type, ExaminerType) else q.examiner_type)
        items.append(
            SubjectExaminerRegionQuotaItem(
                group_id=q.group_id,
                examiner_type=et,
                quota_count=q.quota_count,
            )
        )
    return items


async def _quotas_response(
    session: DBSessionDep,
    exam_id: int,
    subject_id: int,
) -> SubjectExaminerRegionQuotasResponse:
    stmt = (
        select(ExaminationExaminerQuotaRegionGroup)
        .where(ExaminationExaminerQuotaRegionGroup.examination_id == exam_id)
        .options(selectinload(ExaminationExaminerQuotaRegionGroup.regions))
    )
    groups = list((await session.execute(stmt)).scalars().all())
    quotas = await list_quotas_for_subject(session, examination_id=exam_id, subject_id=subject_id)
    dist = await count_roster_distribution(session, examination_id=exam_id, subject_id=subject_id)
    settings = await get_quota_settings_for_subject(
        session, examination_id=exam_id, subject_id=subject_id
    )
    gender_dist = await count_gender_distribution(
        session, examination_id=exam_id, subject_id=subject_id
    )
    roster_total = sum((current.total for current in dist.values()), 0)

    summary: list[SubjectExaminerRegionQuotaSummaryRow] = []
    from app.models import ExaminerType

    for group in sorted(groups, key=lambda g: g.name.lower()):
        current = dist.get(group.id)
        group_total_quota = next(
            (q.quota_count for q in quotas if q.group_id == group.id and q.examiner_type is None),
            None,
        )
        summary.append(
            SubjectExaminerRegionQuotaSummaryRow(
                group_id=group.id,
                group_name=group.name,
                examiner_type=None,
                examiner_type_label="Total",
                current_count=current.total if current else 0,
                quota=group_total_quota,
                remaining=(
                    (group_total_quota - current.total)
                    if group_total_quota is not None and current
                    else group_total_quota
                ),
            )
        )

        for et in ExaminerType:
            role_quota = next(
                (q.quota_count for q in quotas if q.group_id == group.id and q.examiner_type == et),
                None,
            )
            if role_quota is None:
                continue
            role_count = current.by_role.get(et, 0) if current else 0
            summary.append(
                SubjectExaminerRegionQuotaSummaryRow(
                    group_id=group.id,
                    group_name=group.name,
                    examiner_type=ExaminerTypeSchema(et.value),
                    examiner_type_label=_examiner_type_label(et),
                    current_count=role_count,
                    quota=role_quota,
                    remaining=role_quota - role_count,
                )
            )

    gender_summary: list[SubjectExaminerGenderQuotaSummaryRow] = []
    for gender_label, cap, current in (
        ("Male", settings.male_quota, gender_dist.male),
        ("Female", settings.female_quota, gender_dist.female),
    ):
        if cap is None and current == 0:
            continue
        gender_summary.append(
            SubjectExaminerGenderQuotaSummaryRow(
                gender=gender_label,
                gender_label=gender_label,
                current_count=current,
                quota=cap,
                remaining=(cap - current) if cap is not None else None,
            )
        )

    return SubjectExaminerRegionQuotasResponse(
        examination_id=exam_id,
        subject_id=subject_id,
        total_quota=settings.total_quota,
        male_quota=settings.male_quota,
        female_quota=settings.female_quota,
        roster_total=roster_total,
        groups=[g.model_dump() for g in _group_rows(groups)],
        summary=summary,
        gender_summary=gender_summary,
        items=_quota_items(quotas),
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
