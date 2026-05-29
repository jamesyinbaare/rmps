"""Finance: per-examination designation allowance rates."""

from datetime import datetime
from decimal import Decimal
from typing import cast

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import ExamOfficialDesignation, Examination, ExaminationDesignationRate
from app.schemas.examination_designation_rate import (
    ExaminationDesignationRateAmountsUpdate,
    ExaminationDesignationRateRow,
    ExaminationDesignationRatesPut,
    ExaminationDesignationRatesResponse,
)
from app.services.exam_official_compensation import designation_from_api_label
from app.services.exam_official_export import designation_str

router = APIRouter(prefix="/admin/examinations", tags=["admin-examination-designation-rates"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _row_from_db(rate: ExaminationDesignationRate | None, designation: ExamOfficialDesignation) -> ExaminationDesignationRateRow:
    if rate is None:
        return ExaminationDesignationRateRow(designation=designation.value)
    return ExaminationDesignationRateRow(
        designation=designation_str(rate.designation),
        daily_rate_ghs=cast(Decimal | None, rate.daily_rate_ghs),
        commuting_allowance_ghs=cast(Decimal | None, rate.commuting_allowance_ghs),
        airtime_ghs=cast(Decimal | None, rate.airtime_ghs),
    )


@router.get("/{exam_id}/designation-rates", response_model=ExaminationDesignationRatesResponse)
async def get_examination_designation_rates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationDesignationRatesResponse:
    await _load_examination(session, exam_id)
    stmt = select(ExaminationDesignationRate).where(ExaminationDesignationRate.examination_id == exam_id)
    result = await session.execute(stmt)
    by_designation: dict[ExamOfficialDesignation, ExaminationDesignationRate] = {}
    for row in result.scalars().all():
        des = row.designation
        if isinstance(des, ExamOfficialDesignation):
            by_designation[des] = row
        else:
            for member in ExamOfficialDesignation:
                if member.value == str(des):
                    by_designation[member] = row
                    break
    items = [_row_from_db(by_designation.get(member), member) for member in ExamOfficialDesignation]
    return ExaminationDesignationRatesResponse(examination_id=exam_id, items=items)


@router.put("/{exam_id}/designation-rates", response_model=ExaminationDesignationRatesResponse)
async def put_examination_designation_rates(
    exam_id: int,
    body: ExaminationDesignationRatesPut,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationDesignationRatesResponse:
    await _load_examination(session, exam_id)

    seen: set[ExamOfficialDesignation] = set()
    for item in body.items:
        try:
            des = designation_from_api_label(item.designation)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if des in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate designation in payload: {des.value}",
            )
        seen.add(des)

        stmt = select(ExaminationDesignationRate).where(
            ExaminationDesignationRate.examination_id == exam_id,
            ExaminationDesignationRate.designation == des,
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()
        now = datetime.utcnow()
        if existing is None:
            existing = ExaminationDesignationRate(
                examination_id=exam_id,
                designation=des,
                created_at=now,
                updated_at=now,
            )
            session.add(existing)
        existing.daily_rate_ghs = item.daily_rate_ghs
        existing.commuting_allowance_ghs = item.commuting_allowance_ghs
        existing.airtime_ghs = item.airtime_ghs
        existing.updated_at = now

    await session.commit()
    return await get_examination_designation_rates(exam_id, session, _)


@router.patch("/{exam_id}/designation-rates/{designation_label}", response_model=ExaminationDesignationRateRow)
async def patch_examination_designation_rate(
    exam_id: int,
    designation_label: str,
    body: ExaminationDesignationRateAmountsUpdate,
    session: DBSessionDep,
    _: SuperAdminOrFinanceOfficerDep,
) -> ExaminationDesignationRateRow:
    await _load_examination(session, exam_id)
    try:
        des = designation_from_api_label(designation_label)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    stmt = select(ExaminationDesignationRate).where(
        ExaminationDesignationRate.examination_id == exam_id,
        ExaminationDesignationRate.designation == des,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    now = datetime.utcnow()
    if existing is None:
        existing = ExaminationDesignationRate(
            examination_id=exam_id,
            designation=des,
            created_at=now,
            updated_at=now,
        )
        session.add(existing)
    existing.daily_rate_ghs = body.daily_rate_ghs
    existing.commuting_allowance_ghs = body.commuting_allowance_ghs
    existing.airtime_ghs = body.airtime_ghs
    existing.updated_at = now
    await session.commit()
    await session.refresh(existing)
    return _row_from_db(existing, des)
