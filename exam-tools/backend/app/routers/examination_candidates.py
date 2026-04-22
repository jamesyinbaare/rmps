"""Registered candidates for an examination (import + list)."""

import io
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationCandidate, Region, School, Zone
from app.routers.examinations import _get_exam_or_404
from app.schemas.examination_candidates import (
    ExaminationCandidateListResponse,
    ExaminationCandidateImportResponse,
    ExaminationCandidateResponse,
)
from app.services.examination_candidate_import import import_candidates_dataframe, parse_candidates_file

router = APIRouter(prefix="/examinations", tags=["examinations"])


def _parse_region_filter(raw: str) -> Region:
    value = raw.strip()
    if not value:
        raise ValueError("Region cannot be empty.")
    for region in Region:
        if value.lower() in (region.name.lower(), region.value.lower()):
            return region
    raise ValueError(f"Invalid region: {raw!r}")


def _parse_zone_filter(raw: str) -> Zone:
    value = raw.strip()
    if not value:
        raise ValueError("Zone cannot be empty.")
    for zone in Zone:
        if value.lower() in (zone.name.lower(), zone.value.lower()):
            return zone
    raise ValueError(f"Invalid zone: {raw!r}")


@router.get("/{exam_id}/candidates", response_model=ExaminationCandidateListResponse)
async def list_examination_candidates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=50, ge=1, le=500, description="Page size"),
    school_id: UUID | None = Query(default=None, description="Filter by school UUID"),
    school_q: str | None = Query(default=None, description="Filter by school code/name"),
    region: str | None = Query(default=None, description="Filter by school region"),
    zone: str | None = Query(default=None, description="Filter by school zone"),
) -> ExaminationCandidateListResponse:
    await _get_exam_or_404(session, exam_id)
    base_stmt = select(ExaminationCandidate).where(ExaminationCandidate.examination_id == exam_id)
    needs_school_join = region is not None or zone is not None or school_q is not None
    if needs_school_join:
        base_stmt = base_stmt.join(School, ExaminationCandidate.school_id == School.id)
    if school_id is not None:
        base_stmt = base_stmt.where(ExaminationCandidate.school_id == school_id)
    if school_q is not None and school_q.strip():
        q = f"%{school_q.strip()}%"
        base_stmt = base_stmt.where(or_(School.code.ilike(q), School.name.ilike(q)))
    if region is not None and region.strip():
        try:
            region_filter = _parse_region_filter(region)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        base_stmt = base_stmt.where(School.region == region_filter)
    if zone is not None and zone.strip():
        try:
            zone_filter = _parse_zone_filter(zone)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        base_stmt = base_stmt.where(School.zone == zone_filter)

    count_stmt = select(func.count()).select_from(base_stmt.order_by(None).subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    stmt = (
        base_stmt.options(
            selectinload(ExaminationCandidate.subject_selections),
            selectinload(ExaminationCandidate.school),
            selectinload(ExaminationCandidate.programme),
        )
        .order_by(ExaminationCandidate.registration_number)
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(stmt)
    candidates = result.scalars().all()
    return ExaminationCandidateListResponse(
        items=[ExaminationCandidateResponse.from_orm_candidate(c) for c in candidates],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{exam_id}/candidates/import-template")
async def download_candidate_import_template(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
) -> StreamingResponse:
    await _get_exam_or_404(session, exam_id)
    df = pd.DataFrame(
        columns=[
            "registration_number",
            "index_number",
            "school_code",
            "programme_code",
            "name",
            "dob",
            "subject_original_codes",
        ]
    )
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Candidates")
    buf.seek(0)
    stmt = select(Examination).where(Examination.id == exam_id)
    res = await session.execute(stmt)
    exam = res.scalar_one()
    base = f"{exam.year}_{exam.exam_series or 'exam'}_{exam.exam_type}_candidates_template"
    safe = "".join(c for c in base if c.isalnum() or c in ("_", "-"))
    filename = f"{safe}.xlsx"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{exam_id}/candidates/import",
    response_model=ExaminationCandidateImportResponse,
    status_code=status.HTTP_200_OK,
)
async def import_examination_candidates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
    file: UploadFile = File(...),
) -> ExaminationCandidateImportResponse:
    await _get_exam_or_404(session, exam_id)
    raw = await file.read()
    try:
        df = parse_candidates_file(raw, file.filename or "unknown")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    total_rows, successful, errors = await import_candidates_dataframe(session, exam_id, df)
    failed = total_rows - successful
    if successful > 0:
        await session.commit()
    else:
        await session.rollback()

    return ExaminationCandidateImportResponse(
        total_rows=total_rows,
        successful=successful,
        failed=failed,
        errors=errors,
    )
