"""Admin: per-examination region groups for examiner roster quotas."""

from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationExaminerQuotaRegionGroup, ExaminationExaminerQuotaRegionGroupRegion, Region
from app.schemas.examination_examiner_quota_region_group import (
    ExaminerQuotaRegionGroupRow,
    ExaminationExaminerQuotaRegionGroupsPut,
    ExaminationExaminerQuotaRegionGroupsResponse,
)
from app.services.examiner_quota_region_group import (
    quota_regions_fully_mapped,
    validate_quota_region_group_payload,
)
from app.services.examiner_roster import parse_region

router = APIRouter(prefix="/admin/examinations", tags=["admin-examiner-quota-region-groups"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _group_rows(groups: list[ExaminationExaminerQuotaRegionGroup]) -> list[ExaminerQuotaRegionGroupRow]:
    return [
        ExaminerQuotaRegionGroupRow(
            id=group.id,
            name=group.name,
            regions=sorted(
                r.region.value if isinstance(r.region, Region) else str(r.region)
                for r in group.regions
            ),
        )
        for group in sorted(groups, key=lambda g: g.name.lower())
    ]


async def _load_groups(session: DBSessionDep, exam_id: int) -> list[ExaminationExaminerQuotaRegionGroup]:
    stmt = (
        select(ExaminationExaminerQuotaRegionGroup)
        .where(ExaminationExaminerQuotaRegionGroup.examination_id == exam_id)
        .options(selectinload(ExaminationExaminerQuotaRegionGroup.regions))
    )
    return list((await session.execute(stmt)).scalars().all())


@router.get(
    "/{exam_id}/examiner-quota-region-groups",
    response_model=ExaminationExaminerQuotaRegionGroupsResponse,
)
async def get_examination_examiner_quota_region_groups(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminationExaminerQuotaRegionGroupsResponse:
    await _load_examination(session, exam_id)
    groups = await _load_groups(session, exam_id)
    complete = await quota_regions_fully_mapped(session, exam_id)
    return ExaminationExaminerQuotaRegionGroupsResponse(
        examination_id=exam_id,
        groups=_group_rows(groups),
        regions_complete=complete,
    )


@router.put(
    "/{exam_id}/examiner-quota-region-groups",
    response_model=ExaminationExaminerQuotaRegionGroupsResponse,
)
async def put_examination_examiner_quota_region_groups(
    exam_id: int,
    body: ExaminationExaminerQuotaRegionGroupsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminationExaminerQuotaRegionGroupsResponse:
    await _load_examination(session, exam_id)

    try:
        normalized = validate_quota_region_group_payload(
            [{"name": g.name, "regions": g.regions} for g in body.groups]
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    existing_groups = await _load_groups(session, exam_id)
    existing_by_id = {g.id: g for g in existing_groups}

    for group_row in body.groups:
        if group_row.id is not None and group_row.id not in existing_by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Quota region group {group_row.id} does not belong to this examination.",
            )

    kept_ids: set[UUID] = set()
    for group_row, (name, region_strs) in zip(body.groups, normalized, strict=True):
        region_enums: list[Region] = []
        for region_str in region_strs:
            try:
                region_enums.append(parse_region(region_str))
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

        if group_row.id is not None:
            group = existing_by_id[group_row.id]
            group.name = name
            kept_ids.add(group.id)
            await session.execute(
                delete(ExaminationExaminerQuotaRegionGroupRegion).where(
                    ExaminationExaminerQuotaRegionGroupRegion.group_id == group.id
                )
            )
        else:
            group = ExaminationExaminerQuotaRegionGroup(
                id=uuid4(),
                examination_id=exam_id,
                name=name,
            )
            session.add(group)
            await session.flush()
            kept_ids.add(group.id)

        for region in region_enums:
            session.add(
                ExaminationExaminerQuotaRegionGroupRegion(
                    examination_id=exam_id,
                    group_id=group.id,
                    region=region,
                )
            )

    removed_ids = set(existing_by_id.keys()) - kept_ids
    if removed_ids:
        await session.execute(
            delete(ExaminationExaminerQuotaRegionGroup).where(
                ExaminationExaminerQuotaRegionGroup.id.in_(removed_ids),
                ExaminationExaminerQuotaRegionGroup.examination_id == exam_id,
            )
        )

    await session.commit()

    groups = await _load_groups(session, exam_id)
    complete = await quota_regions_fully_mapped(session, exam_id)
    return ExaminationExaminerQuotaRegionGroupsResponse(
        examination_id=exam_id,
        groups=_group_rows(groups),
        regions_complete=complete,
    )
