"""Admin: per-examination region groups for examiner reference codes."""

from uuid import uuid4

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationExaminerRegionGroup, ExaminationExaminerRegionGroupRegion, Region
from app.schemas.examination_examiner_region_group import (
    ExaminerReferenceCodesActionResponse,
    ExaminerReferenceCodesRegenerateRequest,
    ExaminerRegionGroupRow,
    ExaminationExaminerRegionGroupsPut,
    ExaminationExaminerRegionGroupsResponse,
)
from app.services.examiner_reference_code import (
    ReferenceCodeActionResult,
    backfill_reference_codes_for_examination,
    reference_code_stats,
    regenerate_reference_codes_for_examination,
    regions_fully_mapped,
    validate_region_group_payload,
)
from app.services.examiner_roster import parse_region

router = APIRouter(prefix="/admin/examinations", tags=["admin-examiner-region-groups"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _group_rows(groups: list[ExaminationExaminerRegionGroup]) -> list[ExaminerRegionGroupRow]:
    return [
        ExaminerRegionGroupRow(
            id=group.id,
            name=group.name,
            code_prefix=group.code_prefix,
            regions=sorted(
                r.region.value if isinstance(r.region, Region) else str(r.region)
                for r in group.regions
            ),
        )
        for group in sorted(groups, key=lambda g: (g.name.lower(), g.code_prefix))
    ]


@router.get("/{exam_id}/examiner-region-groups", response_model=ExaminationExaminerRegionGroupsResponse)
async def get_examination_examiner_region_groups(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminationExaminerRegionGroupsResponse:
    await _load_examination(session, exam_id)

    stmt = (
        select(ExaminationExaminerRegionGroup)
        .where(ExaminationExaminerRegionGroup.examination_id == exam_id)
        .options(selectinload(ExaminationExaminerRegionGroup.regions))
    )
    groups = list((await session.execute(stmt)).scalars().all())
    complete = await regions_fully_mapped(session, exam_id)
    stats = await reference_code_stats(session, exam_id)
    return ExaminationExaminerRegionGroupsResponse(
        examination_id=exam_id,
        groups=_group_rows(groups),
        regions_complete=complete,
        roster_total=stats.roster_total,
        with_code_count=stats.with_code_count,
        missing_code_count=stats.missing_code_count,
    )


@router.put("/{exam_id}/examiner-region-groups", response_model=ExaminationExaminerRegionGroupsResponse)
async def put_examination_examiner_region_groups(
    exam_id: int,
    body: ExaminationExaminerRegionGroupsPut,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminationExaminerRegionGroupsResponse:
    await _load_examination(session, exam_id)

    try:
        normalized = validate_region_group_payload(
            [
                {"name": g.name, "code_prefix": g.code_prefix, "regions": g.regions}
                for g in body.groups
            ]
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    parsed_regions: list[tuple[str, str, list[Region]]] = []
    for name, prefix, regions in normalized:
        region_enums: list[Region] = []
        for region_str in regions:
            try:
                region_enums.append(parse_region(region_str))
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        parsed_regions.append((name, prefix, region_enums))

    await session.execute(
        delete(ExaminationExaminerRegionGroupRegion).where(
            ExaminationExaminerRegionGroupRegion.examination_id == exam_id
        )
    )
    await session.execute(
        delete(ExaminationExaminerRegionGroup).where(
            ExaminationExaminerRegionGroup.examination_id == exam_id
        )
    )
    await session.flush()

    new_groups: list[ExaminationExaminerRegionGroup] = []
    for name, prefix, region_enums in parsed_regions:
        group = ExaminationExaminerRegionGroup(
            id=uuid4(),
            examination_id=exam_id,
            name=name,
            code_prefix=prefix,
        )
        session.add(group)
        await session.flush()
        for region in region_enums:
            session.add(
                ExaminationExaminerRegionGroupRegion(
                    examination_id=exam_id,
                    group_id=group.id,
                    region=region,
                )
            )
        new_groups.append(group)

    await session.commit()

    stmt = (
        select(ExaminationExaminerRegionGroup)
        .where(ExaminationExaminerRegionGroup.examination_id == exam_id)
        .options(selectinload(ExaminationExaminerRegionGroup.regions))
    )
    groups = list((await session.execute(stmt)).scalars().all())
    stats = await reference_code_stats(session, exam_id)
    return ExaminationExaminerRegionGroupsResponse(
        examination_id=exam_id,
        groups=_group_rows(groups),
        regions_complete=True,
        roster_total=stats.roster_total,
        with_code_count=stats.with_code_count,
        missing_code_count=stats.missing_code_count,
    )


def _action_response(exam_id: int, result: ReferenceCodeActionResult) -> ExaminerReferenceCodesActionResponse:
    return ExaminerReferenceCodesActionResponse(
        examination_id=exam_id,
        assigned_count=result.assigned_count,
        skipped_count=result.skipped_count,
        roster_total=result.roster_total,
    )


@router.post(
    "/{exam_id}/examiner-reference-codes/generate",
    response_model=ExaminerReferenceCodesActionResponse,
)
async def generate_examination_examiner_reference_codes(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerReferenceCodesActionResponse:
    await _load_examination(session, exam_id)
    try:
        result = await backfill_reference_codes_for_examination(session, exam_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    return _action_response(exam_id, result)


@router.post(
    "/{exam_id}/examiner-reference-codes/regenerate",
    response_model=ExaminerReferenceCodesActionResponse,
)
async def regenerate_examination_examiner_reference_codes(
    exam_id: int,
    body: ExaminerReferenceCodesRegenerateRequest,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
) -> ExaminerReferenceCodesActionResponse:
    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set confirm to true to regenerate all reference codes.",
        )
    await _load_examination(session, exam_id)
    try:
        result = await regenerate_reference_codes_for_examination(session, exam_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    return _action_response(exam_id, result)
