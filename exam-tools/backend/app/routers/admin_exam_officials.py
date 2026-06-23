"""Super-admin: list and export exam centre officials across centres."""

from collections import defaultdict
from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import (
    ExamCentreOfficial,
    ExamInspectorSubjectScope,
    Examination,
    ExaminationCentre,
    ExaminationCentreMembership,
    ExamOfficialDesignation,
    Region,
    School,
)
from app.schemas.admin_exam_official import AdminExamCentreOfficialListResponse, AdminExamCentreOfficialRow
from app.services.exam_official_export import (
    build_combined_export,
    build_single_sheet_export,
    build_zip_export,
    designation_str,
    examination_label,
    group_officials_by_centre,
    safe_filename_part,
)
from app.services.exam_official_compensation import load_designation_rates_map
from app.services.finance_school_summary import officials_to_admin_rows

router = APIRouter(prefix="/admin/exam-centre-officials", tags=["admin-exam-officials"])

_MAX_LIST = 1000
_DEFAULT_LIST = 100


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _parse_region_filter(raw: str) -> Region:
    value = raw.strip()
    if not value:
        raise ValueError("Region cannot be empty.")
    for region in Region:
        if value.lower() in (region.name.lower(), region.value.lower()):
            return region
    raise ValueError(f"Invalid region: {raw!r}")


def _region_filter_from_query(region: str | None) -> Region | None:
    if region is None or not str(region).strip():
        return None
    try:
        return _parse_region_filter(region)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


def _centre_region_matches(region: Region, examination_id: int):
    """
    Match examination_centres.region stored as display value, enum name, or via member schools.

    Centres seeded before VARCHAR/enum alignment may store PG enum names (e.g. UPPER_EAST);
    the API exposes display values (e.g. Upper East). Member schools always use Region enum.
    """
    stored = cast(ExaminationCentre.region, String)
    direct = or_(stored == region.value, stored == region.name)
    via_member_school = (
        select(1)
        .select_from(ExaminationCentreMembership)
        .join(School, ExaminationCentreMembership.school_id == School.id)
        .where(
            ExaminationCentreMembership.examination_centre_id == ExaminationCentre.id,
            ExaminationCentreMembership.examination_id == examination_id,
            School.region == region,
        )
        .exists()
    )
    return or_(direct, via_member_school)


def _designation_filter_from_query(
    designation: str | None,
) -> ExamOfficialDesignation | None:
    if designation is None or not str(designation).strip():
        return None
    raw = str(designation).strip()
    for member in ExamOfficialDesignation:
        if member.value == raw:
            return member
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid designation (expected one of: {[e.value for e in ExamOfficialDesignation]})",
    )


def _designations_filter_from_query(
    designation: str | None,
    designations: list[str] | None,
) -> list[ExamOfficialDesignation] | None:
    """Resolve designation filter: repeated ``designations`` wins over single ``designation``."""
    if designations:
        out: list[ExamOfficialDesignation] = []
        for raw in designations:
            label = str(raw).strip()
            if not label:
                continue
            out.append(_designation_filter_from_query(label))
        return out or None
    single = _designation_filter_from_query(designation)
    return [single] if single is not None else None


def _apply_designation_filter(stmt, designations: list[ExamOfficialDesignation] | None):
    if not designations:
        return stmt
    if len(designations) == 1:
        return stmt.where(ExamCentreOfficial.designation == designations[0])
    return stmt.where(ExamCentreOfficial.designation.in_(designations))


def _official_order_by(
    sort_by: Literal["center_code", "full_name", "num_days"],
    sort_dir: Literal["asc", "desc"],
):
    centre_code = ExaminationCentre.code.asc() if sort_dir == "asc" else ExaminationCentre.code.desc()
    full_name = ExamCentreOfficial.full_name.asc() if sort_dir == "asc" else ExamCentreOfficial.full_name.desc()
    num_days = ExamCentreOfficial.num_days.asc() if sort_dir == "asc" else ExamCentreOfficial.num_days.desc()

    if sort_by == "full_name":
        return full_name, centre_code
    if sort_by == "num_days":
        return num_days, centre_code, full_name
    return centre_code, full_name


def _base_official_query(
    examination_id: int,
    center_id: UUID | None,
    designations: list[ExamOfficialDesignation] | None = None,
    subject_scope: ExamInspectorSubjectScope | None = None,
    region: Region | None = None,
    sort_by: Literal["center_code", "full_name", "num_days"] = "center_code",
    sort_dir: Literal["asc", "desc"] = "asc",
):
    stmt = (
        select(ExamCentreOfficial, ExaminationCentre)
        .join(
            ExaminationCentre,
            ExaminationCentre.id == ExamCentreOfficial.examination_centre_id,
        )
        .where(ExamCentreOfficial.examination_id == examination_id)
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    if center_id is not None:
        stmt = stmt.where(ExamCentreOfficial.examination_centre_id == center_id)
    stmt = _apply_designation_filter(stmt, designations)
    if subject_scope is not None:
        stmt = stmt.where(ExamCentreOfficial.subject_scope == subject_scope)
    if region is not None:
        stmt = stmt.where(_centre_region_matches(region, examination_id))
    return stmt.order_by(*_official_order_by(sort_by, sort_dir))


def _official_count_stmt(
    examination_id: int,
    center_id: UUID | None,
    designations: list[ExamOfficialDesignation] | None,
    subject_scope: ExamInspectorSubjectScope | None,
    region: Region | None,
):
    count_stmt = (
        select(func.count())
        .select_from(ExamCentreOfficial)
        .join(
            ExaminationCentre,
            ExaminationCentre.id == ExamCentreOfficial.examination_centre_id,
        )
        .where(ExamCentreOfficial.examination_id == examination_id)
    )
    if center_id is not None:
        count_stmt = count_stmt.where(ExamCentreOfficial.examination_centre_id == center_id)
    count_stmt = _apply_designation_filter(count_stmt, designations)
    if subject_scope is not None:
        count_stmt = count_stmt.where(ExamCentreOfficial.subject_scope == subject_scope)
    if region is not None:
        count_stmt = count_stmt.where(_centre_region_matches(region, examination_id))
    return count_stmt


def _subject_scope_filter_from_query(scope: str | None) -> ExamInspectorSubjectScope | None:
    if scope is None or not str(scope).strip():
        return None
    raw = str(scope).strip().upper()
    if raw == ExamInspectorSubjectScope.CORE.value:
        return ExamInspectorSubjectScope.CORE
    if raw == ExamInspectorSubjectScope.ELECTIVE.value:
        return ExamInspectorSubjectScope.ELECTIVE
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid subject_scope (expected CORE or ELECTIVE)",
    )


@router.get("", response_model=AdminExamCentreOfficialListResponse)
async def admin_list_exam_centre_officials(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
    center_id: UUID | None = Query(None, description="Filter by examination centre id"),
    designation: str | None = Query(
        None,
        description="Filter by official designation label (e.g. External Inspector).",
    ),
    designations: list[str] | None = Query(
        None,
        description="Filter by one or more designation labels (repeat param).",
    ),
    subject_scope: str | None = Query(None, description="Filter by CORE or ELECTIVE"),
    region: str | None = Query(None, description="Filter by examination centre region"),
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIST, ge=1, le=_MAX_LIST),
    sort_by: Literal["center_code", "full_name", "num_days"] = Query(
        "center_code",
        description="Sort field for paginated results.",
    ),
    sort_dir: Literal["asc", "desc"] = Query("asc", description="Sort direction."),
) -> AdminExamCentreOfficialListResponse:
    des_list = _designations_filter_from_query(designation, designations)
    scope = _subject_scope_filter_from_query(subject_scope)
    reg = _region_filter_from_query(region)
    ex = await _load_examination(session, examination_id)
    exam_label = examination_label(ex)

    count_stmt = _official_count_stmt(examination_id, center_id, des_list, scope, reg)
    total = int(await session.scalar(count_stmt) or 0)

    stmt = _base_official_query(
        examination_id, center_id, des_list, scope, reg, sort_by=sort_by, sort_dir=sort_dir
    ).offset(skip).limit(limit)
    result = await session.execute(stmt)
    rows = result.all()

    rates_map = await load_designation_rates_map(session, examination_id)
    items = officials_to_admin_rows(list(rows), examination_id, exam_label, rates_by_designation=rates_map)
    return AdminExamCentreOfficialListResponse(items=items, total=total)


@router.get("/export")
async def admin_export_exam_centre_officials(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
    layout: Literal["zip", "combined", "single_sheet"] = Query(
        "zip",
        description=(
            "zip = one .xlsx per centre in a zip; "
            "combined = one workbook with one worksheet per centre; "
            "single_sheet = one workbook with all centres on a single flat worksheet"
        ),
    ),
    center_id: UUID | None = Query(None, description="Optional: only this centre"),
    designation: str | None = Query(
        None,
        description="Optional: only this designation (e.g. External Inspector).",
    ),
    designations: list[str] | None = Query(
        None,
        description="Optional: one or more designation labels (repeat param).",
    ),
    export_slug: str | None = Query(
        None,
        description="Filename suffix segment (e.g. supervisors, invigilators_all_centres).",
    ),
    subject_scope: str | None = Query(None, description="Optional: CORE or ELECTIVE"),
    region: str | None = Query(None, description="Optional: examination centre region"),
) -> Response:
    des_list = _designations_filter_from_query(designation, designations)
    scope = _subject_scope_filter_from_query(subject_scope)
    reg = _region_filter_from_query(region)
    ex = await _load_examination(session, examination_id)
    exam_label = examination_label(ex)

    stmt = _base_official_query(examination_id, center_id, des_list, scope, reg)
    result = await session.execute(stmt)
    pairs: list[tuple[ExamCentreOfficial, ExaminationCentre]] = list(result.all())
    if not pairs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No exam officials found for this examination (and filter, if any).",
        )

    ordered = group_officials_by_centre(pairs)
    slug = safe_filename_part(export_slug or "officials")
    exam_part = safe_filename_part(f"exam_{examination_id}_{exam_label}")
    file_base = f"{exam_part}_{slug}"

    rates_map = await load_designation_rates_map(session, examination_id)

    if layout == "zip":
        payload, filename, media = build_zip_export(
            ordered, exam_label, file_base, rates_by_designation=rates_map
        )
    elif layout == "combined":
        payload, filename, media = build_combined_export(
            ordered,
            ex,
            rates_by_designation=rates_map,
            file_base=file_base,
        )
    else:
        sheet_title = slug.replace("_", " ").title()
        payload, filename, media = build_single_sheet_export(
            pairs,
            ex,
            sheet_title=sheet_title,
            file_base=file_base,
            rates_by_designation=rates_map,
        )

    return Response(
        content=payload,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/bog-export")
async def admin_export_exam_centre_officials_bog(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
    center_id: UUID | None = Query(None, description="Optional: only this centre"),
    designation: str | None = Query(
        None,
        description="Optional: only this designation (e.g. External Inspector).",
    ),
    designations: list[str] | None = Query(
        None,
        description="Optional: one or more designation labels (repeat param).",
    ),
    export_slug: str | None = Query(
        None,
        description="Filename suffix segment (e.g. supervisors, invigilators_all_centres).",
    ),
    subject_scope: str | None = Query(None, description="Optional: CORE or ELECTIVE"),
    region: str | None = Query(None, description="Optional: examination centre region"),
) -> Response:
    from app.services.exam_official_bog_export import bog_workbook_bytes, exam_bog_export_filename

    des_list = _designations_filter_from_query(designation, designations)
    scope = _subject_scope_filter_from_query(subject_scope)
    reg = _region_filter_from_query(region)
    ex = await _load_examination(session, examination_id)
    exam_label = examination_label(ex)

    stmt = _base_official_query(examination_id, center_id, des_list, scope, reg)
    result = await session.execute(stmt)
    pairs: list[tuple[ExamCentreOfficial, ExaminationCentre]] = list(result.all())
    if not pairs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No exam officials found for this examination (and filter, if any).",
        )

    slug = safe_filename_part(export_slug or "officials")
    exam_part = safe_filename_part(f"exam_{examination_id}_{exam_label}")
    rates_map = await load_designation_rates_map(session, examination_id)
    title = f"BoG payment — {exam_label}"
    payload = bog_workbook_bytes(pairs, rates_map, title=title)
    filename = exam_bog_export_filename(exam_part, slug)
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
