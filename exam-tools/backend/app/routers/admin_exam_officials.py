"""Super-admin: list and export exam centre officials across centres."""

from collections import defaultdict
from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import ExamCentreOfficial, ExamInspectorSubjectScope, Examination, ExamOfficialDesignation, School
from app.schemas.admin_exam_official import AdminExamCentreOfficialListResponse, AdminExamCentreOfficialRow
from app.services.exam_official_export import (
    build_combined_export,
    build_zip_export,
    designation_str,
    examination_label,
    group_officials_by_centre,
    safe_filename_part,
)
from app.services.finance_school_summary import officials_to_admin_rows

router = APIRouter(prefix="/admin/exam-centre-officials", tags=["admin-exam-officials"])

_MAX_LIST = 500
_DEFAULT_LIST = 100


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _base_official_query(
    examination_id: int,
    center_id: UUID | None,
    designation: ExamOfficialDesignation | None = None,
    subject_scope: ExamInspectorSubjectScope | None = None,
):
    stmt = (
        select(ExamCentreOfficial, School)
        .join(School, School.id == ExamCentreOfficial.center_id)
        .where(ExamCentreOfficial.examination_id == examination_id)
        .options(selectinload(ExamCentreOfficial.bank_branch))
    )
    if center_id is not None:
        stmt = stmt.where(ExamCentreOfficial.center_id == center_id)
    if designation is not None:
        stmt = stmt.where(ExamCentreOfficial.designation == designation)
    if subject_scope is not None:
        stmt = stmt.where(ExamCentreOfficial.subject_scope == subject_scope)
    return stmt.order_by(School.code.asc(), ExamCentreOfficial.full_name.asc())


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
    center_id: UUID | None = Query(None, description="Filter by examination centre (host school) id"),
    designation: str | None = Query(
        None,
        description="Filter by official designation label (e.g. External Inspector).",
    ),
    subject_scope: str | None = Query(None, description="Filter by CORE or ELECTIVE"),
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_LIST, ge=1, le=_MAX_LIST),
) -> AdminExamCentreOfficialListResponse:
    des = _designation_filter_from_query(designation)
    scope = _subject_scope_filter_from_query(subject_scope)
    ex = await _load_examination(session, examination_id)
    exam_label = examination_label(ex)

    count_stmt = select(func.count()).select_from(ExamCentreOfficial).where(
        ExamCentreOfficial.examination_id == examination_id
    )
    if center_id is not None:
        count_stmt = count_stmt.where(ExamCentreOfficial.center_id == center_id)
    if des is not None:
        count_stmt = count_stmt.where(ExamCentreOfficial.designation == des)
    if scope is not None:
        count_stmt = count_stmt.where(ExamCentreOfficial.subject_scope == scope)
    total = int(await session.scalar(count_stmt) or 0)

    stmt = _base_official_query(examination_id, center_id, des, scope).offset(skip).limit(limit)
    result = await session.execute(stmt)
    rows = result.all()

    items = officials_to_admin_rows(list(rows), examination_id, exam_label)
    return AdminExamCentreOfficialListResponse(items=items, total=total)


@router.get("/export")
async def admin_export_exam_centre_officials(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int = Query(..., description="Examination id"),
    layout: Literal["zip", "combined"] = Query("zip", description="zip = one workbook per centre in a zip; combined = one workbook"),
    center_id: UUID | None = Query(None, description="Optional: only this centre"),
    designation: str | None = Query(
        None,
        description="Optional: only this designation (e.g. External Inspector).",
    ),
    subject_scope: str | None = Query(None, description="Optional: CORE or ELECTIVE"),
) -> Response:
    des = _designation_filter_from_query(designation)
    scope = _subject_scope_filter_from_query(subject_scope)
    ex = await _load_examination(session, examination_id)
    exam_label = examination_label(ex)

    stmt = _base_official_query(examination_id, center_id, des, scope)
    result = await session.execute(stmt)
    pairs: list[tuple[ExamCentreOfficial, School]] = list(result.all())
    if not pairs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No exam officials found for this examination (and filter, if any).",
        )

    ordered = group_officials_by_centre(pairs)
    exam_part = safe_filename_part(f"exam_{examination_id}_{exam_label}")

    if layout == "zip":
        payload, filename, media = build_zip_export(ordered, exam_label, exam_part)
    else:
        payload, filename, media = build_combined_export(ordered, ex)

    return Response(
        content=payload,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
