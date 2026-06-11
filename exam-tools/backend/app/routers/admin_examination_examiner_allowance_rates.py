"""Finance: per-examination examiner allowance rates."""

from datetime import datetime
from decimal import Decimal
from typing import cast
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ExaminerAllowanceType,
    ExaminerType,
    Examination,
    ExaminationExaminerMarkingRate,
    ExaminationExaminerRoleAllowanceRate,
    ExaminationExaminerTravelRate,
    ExaminationExaminerTravelRoleFactor,
    ExaminationExaminerTravelZone,
    ExaminationExaminerTravelZoneRegion,
    Region,
    Subject,
    SubjectType,
)
from app.schemas.examination_examiner_allowance_rate import (
    ExaminerAllowanceRatesCopyResponse,
    ExaminerAllowanceSubjectRef,
    ExaminerMarkingRateRow,
    ExaminerRoleAllowanceRateCell,
    ExaminerTravelRateRow,
    ExaminerTravelRoleFactorRow,
    ExaminerTravelZoneRow,
    ExaminationExaminerMarkingRatesPut,
    ExaminationExaminerMarkingRatesResponse,
    ExaminationExaminerRoleAllowanceRatesPut,
    ExaminationExaminerRoleAllowanceRatesResponse,
    ExaminationExaminerTravelRatesPut,
    ExaminationExaminerTravelRatesResponse,
)
from app.services.examiner_compensation import (
    allowance_type_from_api_label,
    examiner_type_from_api_label,
    parse_region_stored,
    region_str,
)
from app.services.examiner_roster import parse_region
from app.services.script_control import ordered_subject_papers_on_examination_timetable

router = APIRouter(prefix="/admin/examinations", tags=["admin-examination-examiner-allowance-rates"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _subject_ref(subject: Subject, paper_numbers: list[int]) -> ExaminerAllowanceSubjectRef:
    code = (subject.original_code or subject.code or "").strip()
    st = subject.subject_type
    subject_type = st.value if isinstance(st, SubjectType) else str(st)
    return ExaminerAllowanceSubjectRef(
        id=int(subject.id),
        code=code,
        name=(subject.name or "").strip(),
        subject_type=subject_type,
        paper_numbers=paper_numbers,
    )


async def _timetable_subject_papers(session: DBSessionDep, exam_id: int) -> list[tuple[Subject, list[int]]]:
    return await ordered_subject_papers_on_examination_timetable(session, exam_id)


@router.get("/{exam_id}/examiner-role-allowance-rates", response_model=ExaminationExaminerRoleAllowanceRatesResponse)
async def get_examination_examiner_role_allowance_rates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationExaminerRoleAllowanceRatesResponse:
    await _load_examination(session, exam_id)

    stmt = select(ExaminationExaminerRoleAllowanceRate).where(
        ExaminationExaminerRoleAllowanceRate.examination_id == exam_id,
    )
    result = await session.execute(stmt)
    by_key: dict[tuple[str, str], Decimal | None] = {}
    for row in result.scalars().all():
        et = row.examiner_type
        et_val = et.value if isinstance(et, ExaminerType) else str(et)
        at = row.allowance_type
        at_val = at.value if isinstance(at, ExaminerAllowanceType) else str(at)
        by_key[(et_val, at_val)] = cast(Decimal | None, row.amount_ghs)

    items: list[ExaminerRoleAllowanceRateCell] = []
    for examiner_type in ExaminerType:
        for allowance_type in ExaminerAllowanceType:
            items.append(
                ExaminerRoleAllowanceRateCell(
                    examiner_type=examiner_type.value,
                    allowance_type=allowance_type.value,
                    amount_ghs=by_key.get((examiner_type.value, allowance_type.value)),
                )
            )

    return ExaminationExaminerRoleAllowanceRatesResponse(examination_id=exam_id, items=items)


@router.put("/{exam_id}/examiner-role-allowance-rates", response_model=ExaminationExaminerRoleAllowanceRatesResponse)
async def put_examination_examiner_role_allowance_rates(
    exam_id: int,
    body: ExaminationExaminerRoleAllowanceRatesPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationExaminerRoleAllowanceRatesResponse:
    await _load_examination(session, exam_id)

    seen: set[tuple[ExaminerType, ExaminerAllowanceType]] = set()
    for item in body.items:
        try:
            et = examiner_type_from_api_label(item.examiner_type)
            at = allowance_type_from_api_label(item.allowance_type)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        key = (et, at)
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate cell in payload: {et.value}, {at.value}",
            )
        seen.add(key)

        stmt = select(ExaminationExaminerRoleAllowanceRate).where(
            ExaminationExaminerRoleAllowanceRate.examination_id == exam_id,
            ExaminationExaminerRoleAllowanceRate.examiner_type == et,
            ExaminationExaminerRoleAllowanceRate.allowance_type == at,
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()
        now = datetime.utcnow()
        if existing is None:
            existing = ExaminationExaminerRoleAllowanceRate(
                examination_id=exam_id,
                examiner_type=et,
                allowance_type=at,
                created_at=now,
                updated_at=now,
            )
            session.add(existing)
        existing.amount_ghs = item.amount_ghs
        existing.updated_at = now

    await session.commit()
    return await get_examination_examiner_role_allowance_rates(exam_id, session, _)


@router.get("/{exam_id}/examiner-marking-rates", response_model=ExaminationExaminerMarkingRatesResponse)
async def get_examination_examiner_marking_rates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationExaminerMarkingRatesResponse:
    await _load_examination(session, exam_id)
    subject_papers = await _timetable_subject_papers(session, exam_id)
    subject_refs = [_subject_ref(subject, papers) for subject, papers in subject_papers]

    stmt = select(ExaminationExaminerMarkingRate).where(
        ExaminationExaminerMarkingRate.examination_id == exam_id,
    )
    result = await session.execute(stmt)
    by_key: dict[tuple[int, int], Decimal | None] = {}
    for row in result.scalars().all():
        by_key[(int(row.subject_id), int(row.paper_number))] = cast(Decimal | None, row.rate_per_script_ghs)

    items: list[ExaminerMarkingRateRow] = []
    for subject, papers in subject_papers:
        sid = int(subject.id)
        for paper_number in papers:
            items.append(
                ExaminerMarkingRateRow(
                    subject_id=sid,
                    paper_number=paper_number,
                    rate_per_script_ghs=by_key.get((sid, paper_number)),
                )
            )

    return ExaminationExaminerMarkingRatesResponse(
        examination_id=exam_id,
        subjects=subject_refs,
        items=items,
    )


@router.put("/{exam_id}/examiner-marking-rates", response_model=ExaminationExaminerMarkingRatesResponse)
async def put_examination_examiner_marking_rates(
    exam_id: int,
    body: ExaminationExaminerMarkingRatesPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationExaminerMarkingRatesResponse:
    await _load_examination(session, exam_id)
    subject_papers = await _timetable_subject_papers(session, exam_id)
    valid_keys = {(int(s.id), pn) for s, papers in subject_papers for pn in papers}

    seen: set[tuple[int, int]] = set()
    for item in body.items:
        key = (item.subject_id, item.paper_number)
        if key not in valid_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Subject {item.subject_id} paper {item.paper_number} "
                    "is not on this examination timetable"
                ),
            )
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate cell in payload: subject {item.subject_id}, paper {item.paper_number}",
            )
        seen.add(key)

        stmt = select(ExaminationExaminerMarkingRate).where(
            ExaminationExaminerMarkingRate.examination_id == exam_id,
            ExaminationExaminerMarkingRate.subject_id == item.subject_id,
            ExaminationExaminerMarkingRate.paper_number == item.paper_number,
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()
        now = datetime.utcnow()
        if existing is None:
            existing = ExaminationExaminerMarkingRate(
                examination_id=exam_id,
                subject_id=item.subject_id,
                paper_number=item.paper_number,
                created_at=now,
                updated_at=now,
            )
            session.add(existing)
        existing.rate_per_script_ghs = item.rate_per_script_ghs
        existing.updated_at = now

    await session.commit()
    return await get_examination_examiner_marking_rates(exam_id, session, _)


@router.get("/{exam_id}/examiner-travel-rates", response_model=ExaminationExaminerTravelRatesResponse)
async def get_examination_examiner_travel_rates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationExaminerTravelRatesResponse:
    await _load_examination(session, exam_id)
    stmt = select(ExaminationExaminerTravelRate).where(
        ExaminationExaminerTravelRate.examination_id == exam_id,
    )
    result = await session.execute(stmt)
    by_region: dict[Region, Decimal | None] = {}
    for row in result.scalars().all():
        region = parse_region_stored(row.region)
        by_region[region] = cast(Decimal | None, row.amount_ghs)

    items = [
        ExaminerTravelRateRow(region=region_str(region), amount_ghs=by_region.get(region))
        for region in Region
    ]

    zone_stmt = (
        select(ExaminationExaminerTravelZone)
        .where(ExaminationExaminerTravelZone.examination_id == exam_id)
        .order_by(ExaminationExaminerTravelZone.sort_order.asc(), ExaminationExaminerTravelZone.name.asc())
    )
    zone_rows = list((await session.execute(zone_stmt)).scalars().all())

    region_stmt = select(ExaminationExaminerTravelZoneRegion).where(
        ExaminationExaminerTravelZoneRegion.examination_id == exam_id,
    )
    region_rows = list((await session.execute(region_stmt)).scalars().all())
    regions_by_zone: dict[UUID, list[str]] = {zone.id: [] for zone in zone_rows}
    for row in region_rows:
        regions_by_zone.setdefault(row.zone_id, []).append(region_str(parse_region_stored(row.region)))

    zones = [
        ExaminerTravelZoneRow(
            id=zone.id,
            name=str(zone.name),
            regions=sorted(regions_by_zone.get(zone.id, [])),
        )
        for zone in zone_rows
    ]

    factor_stmt = select(ExaminationExaminerTravelRoleFactor).where(
        ExaminationExaminerTravelRoleFactor.examination_id == exam_id,
    )
    factor_result = await session.execute(factor_stmt)
    by_role_zone: dict[tuple[str, UUID], Decimal | None] = {}
    for row in factor_result.scalars().all():
        et = row.examiner_type
        et_val = et.value if isinstance(et, ExaminerType) else str(et)
        by_role_zone[(et_val, row.zone_id)] = cast(Decimal | None, row.factor)

    role_factors = [
        ExaminerTravelRoleFactorRow(
            examiner_type=examiner_type.value,
            zone_id=zone.id,
            factor=by_role_zone.get((examiner_type.value, zone.id)),
        )
        for zone in zone_rows
        for examiner_type in ExaminerType
    ]

    return ExaminationExaminerTravelRatesResponse(
        examination_id=exam_id,
        zones=zones,
        items=items,
        role_factors=role_factors,
    )


@router.put("/{exam_id}/examiner-travel-rates", response_model=ExaminationExaminerTravelRatesResponse)
async def put_examination_examiner_travel_rates(
    exam_id: int,
    body: ExaminationExaminerTravelRatesPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationExaminerTravelRatesResponse:
    await _load_examination(session, exam_id)
    now = datetime.utcnow()

    seen: set[Region] = set()
    for item in body.items:
        try:
            region = parse_region(item.region)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if region in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate region in payload: {region.value}",
            )
        seen.add(region)

        stmt = select(ExaminationExaminerTravelRate).where(
            ExaminationExaminerTravelRate.examination_id == exam_id,
            ExaminationExaminerTravelRate.region == region,
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing is None:
            existing = ExaminationExaminerTravelRate(
                examination_id=exam_id,
                region=region,
                created_at=now,
                updated_at=now,
            )
            session.add(existing)
        existing.amount_ghs = item.amount_ghs
        existing.updated_at = now

    if body.zones is not None:
        seen_zone_names: set[str] = set()
        seen_regions: set[Region] = set()
        payload_zone_ids: set[UUID] = set()
        resolved_zones: list[tuple[UUID, list[str]]] = []

        for idx, item in enumerate(body.zones):
            name = item.name.strip()
            if not name:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zone name is required")
            if name in seen_zone_names:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate zone name in payload: {name}",
                )
            seen_zone_names.add(name)

            if item.id is not None:
                existing_zone = await session.get(ExaminationExaminerTravelZone, item.id)
                if existing_zone is not None and int(existing_zone.examination_id) != exam_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Zone id {item.id} belongs to another examination",
                    )
                if existing_zone is not None:
                    existing_zone.name = name
                    existing_zone.sort_order = idx
                    existing_zone.updated_at = now
                    zone_id = item.id
                else:
                    zone_id = item.id
                    session.add(
                        ExaminationExaminerTravelZone(
                            id=zone_id,
                            examination_id=exam_id,
                            name=name,
                            sort_order=idx,
                            created_at=now,
                            updated_at=now,
                        )
                    )
            else:
                zone_id = uuid4()
                session.add(
                    ExaminationExaminerTravelZone(
                        id=zone_id,
                        examination_id=exam_id,
                        name=name,
                        sort_order=idx,
                        created_at=now,
                        updated_at=now,
                    )
                )

            payload_zone_ids.add(zone_id)
            resolved_zones.append((zone_id, item.regions))

            for region_label in item.regions:
                try:
                    region = parse_region(region_label)
                except ValueError as exc:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
                if region in seen_regions:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Region {region.value} is assigned to more than one zone",
                    )
                seen_regions.add(region)

        existing_zone_stmt = select(ExaminationExaminerTravelZone).where(
            ExaminationExaminerTravelZone.examination_id == exam_id,
        )
        existing_zones = list((await session.execute(existing_zone_stmt)).scalars().all())
        for zone in existing_zones:
            if zone.id not in payload_zone_ids:
                await session.delete(zone)

        await session.flush()

        await session.execute(
            delete(ExaminationExaminerTravelZoneRegion).where(
                ExaminationExaminerTravelZoneRegion.examination_id == exam_id,
            )
        )
        for zone_id, region_labels in resolved_zones:
            for region_label in region_labels:
                region = parse_region(region_label)
                session.add(
                    ExaminationExaminerTravelZoneRegion(
                        examination_id=exam_id,
                        zone_id=zone_id,
                        region=region,
                        created_at=now,
                        updated_at=now,
                    )
                )

    if body.role_factors is not None:
        seen_role_zone: set[tuple[ExaminerType, UUID]] = set()
        for item in body.role_factors:
            try:
                et = examiner_type_from_api_label(item.examiner_type)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            zone = await session.get(ExaminationExaminerTravelZone, item.zone_id)
            if zone is None or int(zone.examination_id) != exam_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown zone id: {item.zone_id}",
                )
            key = (et, item.zone_id)
            if key in seen_role_zone:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate role/zone in payload: {et.value} / {item.zone_id}",
                )
            seen_role_zone.add(key)

            factor_stmt = select(ExaminationExaminerTravelRoleFactor).where(
                ExaminationExaminerTravelRoleFactor.examination_id == exam_id,
                ExaminationExaminerTravelRoleFactor.examiner_type == et,
                ExaminationExaminerTravelRoleFactor.zone_id == item.zone_id,
            )
            existing_factor = (await session.execute(factor_stmt)).scalar_one_or_none()
            if existing_factor is None:
                existing_factor = ExaminationExaminerTravelRoleFactor(
                    examination_id=exam_id,
                    examiner_type=et,
                    zone_id=item.zone_id,
                    created_at=now,
                    updated_at=now,
                )
                session.add(existing_factor)
            existing_factor.factor = item.factor
            existing_factor.updated_at = now

    await session.commit()
    return await get_examination_examiner_travel_rates(exam_id, session, _)


@router.post(
    "/{exam_id}/examiner-allowance-rates/copy-from/{source_exam_id}",
    response_model=ExaminerAllowanceRatesCopyResponse,
)
async def copy_examination_examiner_allowance_rates(
    exam_id: int,
    source_exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminerAllowanceRatesCopyResponse:
    if exam_id == source_exam_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source examination must differ from target examination",
        )
    await _load_examination(session, exam_id)
    await _load_examination(session, source_exam_id)

    await session.execute(
        delete(ExaminationExaminerRoleAllowanceRate).where(
            ExaminationExaminerRoleAllowanceRate.examination_id == exam_id,
        )
    )
    await session.execute(
        delete(ExaminationExaminerMarkingRate).where(
            ExaminationExaminerMarkingRate.examination_id == exam_id,
        )
    )
    await session.execute(
        delete(ExaminationExaminerTravelRate).where(
            ExaminationExaminerTravelRate.examination_id == exam_id,
        )
    )
    await session.execute(
        delete(ExaminationExaminerTravelZone).where(
            ExaminationExaminerTravelZone.examination_id == exam_id,
        )
    )

    src_role_stmt = select(ExaminationExaminerRoleAllowanceRate).where(
        ExaminationExaminerRoleAllowanceRate.examination_id == source_exam_id,
    )
    src_marking_stmt = select(ExaminationExaminerMarkingRate).where(
        ExaminationExaminerMarkingRate.examination_id == source_exam_id,
    )
    src_travel_stmt = select(ExaminationExaminerTravelRate).where(
        ExaminationExaminerTravelRate.examination_id == source_exam_id,
    )
    src_travel_zone_stmt = select(ExaminationExaminerTravelZone).where(
        ExaminationExaminerTravelZone.examination_id == source_exam_id,
    )
    src_travel_zone_region_stmt = select(ExaminationExaminerTravelZoneRegion).where(
        ExaminationExaminerTravelZoneRegion.examination_id == source_exam_id,
    )
    src_travel_factor_stmt = select(ExaminationExaminerTravelRoleFactor).where(
        ExaminationExaminerTravelRoleFactor.examination_id == source_exam_id,
    )
    now = datetime.utcnow()
    zone_id_map: dict[UUID, UUID] = {}
    for row in (await session.execute(src_travel_zone_stmt)).scalars().all():
        new_zone_id = uuid4()
        zone_id_map[row.id] = new_zone_id
        session.add(
            ExaminationExaminerTravelZone(
                id=new_zone_id,
                examination_id=exam_id,
                name=row.name,
                sort_order=row.sort_order,
                created_at=now,
                updated_at=now,
            )
        )
    for row in (await session.execute(src_travel_zone_region_stmt)).scalars().all():
        new_zone_id = zone_id_map.get(row.zone_id)
        if new_zone_id is None:
            continue
        session.add(
            ExaminationExaminerTravelZoneRegion(
                examination_id=exam_id,
                zone_id=new_zone_id,
                region=row.region,
                created_at=now,
                updated_at=now,
            )
        )
    for row in (await session.execute(src_role_stmt)).scalars().all():
        session.add(
            ExaminationExaminerRoleAllowanceRate(
                examination_id=exam_id,
                examiner_type=row.examiner_type,
                allowance_type=row.allowance_type,
                amount_ghs=row.amount_ghs,
                created_at=now,
                updated_at=now,
            )
        )
    for row in (await session.execute(src_marking_stmt)).scalars().all():
        session.add(
            ExaminationExaminerMarkingRate(
                examination_id=exam_id,
                subject_id=row.subject_id,
                paper_number=row.paper_number,
                rate_per_script_ghs=row.rate_per_script_ghs,
                created_at=now,
                updated_at=now,
            )
        )
    for row in (await session.execute(src_travel_stmt)).scalars().all():
        session.add(
            ExaminationExaminerTravelRate(
                examination_id=exam_id,
                region=row.region,
                amount_ghs=row.amount_ghs,
                created_at=now,
                updated_at=now,
            )
        )
    for row in (await session.execute(src_travel_factor_stmt)).scalars().all():
        new_zone_id = zone_id_map.get(row.zone_id)
        if new_zone_id is None:
            continue
        session.add(
            ExaminationExaminerTravelRoleFactor(
                examination_id=exam_id,
                examiner_type=row.examiner_type,
                zone_id=new_zone_id,
                factor=row.factor,
                created_at=now,
                updated_at=now,
            )
        )

    await session.commit()
    return ExaminerAllowanceRatesCopyResponse(examination_id=exam_id)
