"""Super-admin / finance: list and export examiner allowances."""

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, ExaminerBankAccount, ExaminerSubject, ExaminerType, Examination, Region
from app.schemas.admin_examiner_allowance import AdminExaminerAllowanceListResponse
from app.services.exam_official_export import examination_label, safe_filename_part
from app.services.examiner_allowance_bog_export import (
    examiner_bog_export_filename,
    examiner_bog_workbook_bytes,
)
from app.services.examiner_allowance_export import examiner_detail_workbook_bytes, examiner_export_filename
from app.services.examiner_allowance_list import examiners_to_admin_rows
from app.services.examiner_allocated_booklets import load_allocated_booklets_map
from app.services.examiner_compensation import (
    examiner_type_from_api_label,
    load_marking_rates_map,
    load_role_allowance_rates_map,
    load_travel_rates_map,
    load_travel_role_factors_map,
    load_travel_zones_map,
)
from app.services.examiner_roster import parse_region

router = APIRouter(prefix="/admin/examiner-allowances", tags=["admin-examiner-allowances"])

_MAX_LIST = 1000
_DEFAULT_LIST = 100


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _region_filter_from_query(region: str | None) -> Region | None:
    if region is None or not str(region).strip():
        return None
    try:
        return parse_region(region)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def _examiner_type_filter_from_query(role: str | None) -> ExaminerType | None:
    if role is None or not str(role).strip():
        return None
    try:
        return examiner_type_from_api_label(role)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def _base_examiner_stmt(
    examination_id: int,
    *,
    role: ExaminerType | None = None,
    region: Region | None = None,
    subject_id: int | None = None,
    search: str | None = None,
):
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(
            selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject),
            selectinload(Examiner.bank_account).selectinload(ExaminerBankAccount.bank_branch),
        )
    )
    if role is not None:
        stmt = stmt.where(Examiner.examiner_type == role)
    if region is not None:
        stmt = stmt.where(Examiner.region == region)
    if subject_id is not None:
        stmt = stmt.where(
            Examiner.id.in_(
                select(ExaminerSubject.examiner_id).where(ExaminerSubject.subject_id == subject_id)
            )
        )
    if search and str(search).strip():
        q = f"%{str(search).strip()}%"
        stmt = stmt.where(
            or_(
                Examiner.name.ilike(q),
                Examiner.phone_number.ilike(q),
            )
        )
    return stmt.order_by(Examiner.name.asc())


@router.get("", response_model=AdminExaminerAllowanceListResponse)
async def admin_list_examiner_allowances(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
    role: str | None = Query(None, description="Filter by examiner role"),
    region: str | None = Query(None, description="Filter by examiner home region"),
    subject_id: int | None = Query(None, description="Filter by assigned subject id"),
    search: str | None = Query(None, description="Search name or phone"),
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIST, ge=1, le=_MAX_LIST),
) -> AdminExaminerAllowanceListResponse:
    ex = await _load_examination(session, examination_id)
    role_filter = _examiner_type_filter_from_query(role)
    region_filter = _region_filter_from_query(region)

    base = _base_examiner_stmt(
        examination_id,
        role=role_filter,
        region=region_filter,
        subject_id=subject_id,
        search=search,
    )
    count_stmt = select(func.count()).select_from(base.subquery())
    total = int(await session.scalar(count_stmt) or 0)

    result = await session.execute(base.offset(skip).limit(limit))
    examiners = list(result.scalars().all())

    role_rates = await load_role_allowance_rates_map(session, examination_id)
    marking_rates = await load_marking_rates_map(session, examination_id)
    travel = await load_travel_rates_map(session, examination_id)
    travel_zones, travel_zone_names = await load_travel_zones_map(session, examination_id)
    travel_factors = await load_travel_role_factors_map(session, examination_id)
    allocated_booklets = await load_allocated_booklets_map(session, examination_id)
    items = examiners_to_admin_rows(
        examiners,
        ex,
        role_rates,
        marking_rates,
        travel,
        travel_zones,
        travel_zone_names,
        travel_factors,
        allocated_booklets,
    )
    return AdminExaminerAllowanceListResponse(items=items, total=total)


@router.get("/export.xlsx")
async def admin_export_examiner_allowances(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
    role: str | None = Query(None),
    region: str | None = Query(None),
    subject_id: int | None = Query(None),
    search: str | None = Query(None),
) -> Response:
    ex = await _load_examination(session, examination_id)
    role_filter = _examiner_type_filter_from_query(role)
    region_filter = _region_filter_from_query(region)

    stmt = _base_examiner_stmt(
        examination_id,
        role=role_filter,
        region=region_filter,
        subject_id=subject_id,
        search=search,
    )
    result = await session.execute(stmt)
    examiners = list(result.scalars().all())
    if not examiners:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examiners found for this examination (and filter, if any).",
        )

    role_rates = await load_role_allowance_rates_map(session, examination_id)
    marking_rates = await load_marking_rates_map(session, examination_id)
    travel = await load_travel_rates_map(session, examination_id)
    allocated_booklets = await load_allocated_booklets_map(session, examination_id)
    travel_zones, travel_zone_names = await load_travel_zones_map(session, examination_id)
    travel_factors = await load_travel_role_factors_map(session, examination_id)
    payload = examiner_detail_workbook_bytes(
        examiners,
        ex,
        role_rates,
        marking_rates,
        travel,
        travel_zones,
        travel_zone_names,
        travel_factors,
        allocated_booklets,
    )
    filename = examiner_export_filename(ex)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/bog-export.xlsx")
async def admin_bog_export_examiner_allowances(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
    role: str | None = Query(None),
    region: str | None = Query(None),
    subject_id: int | None = Query(None),
    search: str | None = Query(None),
) -> Response:
    ex = await _load_examination(session, examination_id)
    role_filter = _examiner_type_filter_from_query(role)
    region_filter = _region_filter_from_query(region)

    stmt = _base_examiner_stmt(
        examination_id,
        role=role_filter,
        region=region_filter,
        subject_id=subject_id,
        search=search,
    )
    result = await session.execute(stmt)
    examiners = list(result.scalars().all())
    if not examiners:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examiners found for this examination (and filter, if any).",
        )

    role_rates = await load_role_allowance_rates_map(session, examination_id)
    marking_rates = await load_marking_rates_map(session, examination_id)
    travel = await load_travel_rates_map(session, examination_id)
    allocated_booklets = await load_allocated_booklets_map(session, examination_id)
    exam_part = safe_filename_part(f"exam_{examination_id}_{examination_label(ex)}")
    title = f"BoG payment — {examination_label(ex)} — examiners"
    travel_zones, travel_zone_names = await load_travel_zones_map(session, examination_id)
    travel_factors = await load_travel_role_factors_map(session, examination_id)
    payload = examiner_bog_workbook_bytes(
        examiners,
        ex,
        role_rates,
        marking_rates,
        travel,
        travel_zones,
        travel_zone_names,
        travel_factors,
        allocated_booklets,
        title=title,
    )
    filename = examiner_bog_export_filename(exam_part)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
