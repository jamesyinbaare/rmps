"""Registered candidates for an examination (import + list)."""

import io
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminationCandidate
from app.routers.examinations import _get_exam_or_404
from app.schemas.examination_candidates import (
    ExaminationCandidateImportResponse,
    ExaminationCandidateResponse,
)
from app.services.examination_candidate_import import import_candidates_dataframe, parse_candidates_file

router = APIRouter(prefix="/examinations", tags=["examinations"])


@router.get("/{exam_id}/candidates", response_model=list[ExaminationCandidateResponse])
async def list_examination_candidates(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminDep,
    school_id: UUID | None = Query(default=None, description="Filter by school UUID"),
) -> list[ExaminationCandidateResponse]:
    await _get_exam_or_404(session, exam_id)
    stmt = (
        select(ExaminationCandidate)
        .where(ExaminationCandidate.examination_id == exam_id)
        .options(
            selectinload(ExaminationCandidate.subject_selections),
            selectinload(ExaminationCandidate.school),
            selectinload(ExaminationCandidate.programme),
        )
        .order_by(ExaminationCandidate.registration_number)
    )
    if school_id is not None:
        stmt = stmt.where(ExaminationCandidate.school_id == school_id)
    result = await session.execute(stmt)
    candidates = result.scalars().all()
    return [ExaminationCandidateResponse.from_orm_candidate(c) for c in candidates]


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
