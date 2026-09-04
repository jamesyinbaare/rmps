"""Admin bulk upload and payout settings for special examiners."""

from __future__ import annotations

from uuid import UUID

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SuperAdminDep, SuperAdminOrFinanceOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, ExaminerPayoutAdjustment, ExaminerPayoutOverride, ExaminerRosterSource, Examination
from app.schemas.examiner_payout_override import (
    ExaminerPayoutOverrideBulkImportResponse,
    ExaminerPayoutOverrideBulkImportRowError,
    ExaminerPayoutSettingsUpdate,
)
from app.services.examiner_compensation import (
    MarkingDefaults,
    has_default_marking_rate,
    load_marking_defaults,
    parse_examiner_type_stored,
)
from app.services.examiner_payout_override_upload import (
    _MAX_BULK_BYTES,
    _MAX_BULK_ROWS,
    bulk_upload_payout_overrides,
    generate_payout_override_template_bytes,
    read_payout_override_spreadsheet,
    validate_special_allocation_counts,
)
from app.services.examiner_report_count import validate_report_count_for_type

router = APIRouter(prefix="/admin/examinations", tags=["admin-examiner-payout-overrides"])


async def _load_examination(session: DBSessionDep, exam_id: int) -> Examination:
    ex = await session.get(Examination, exam_id)
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return ex


def _require_default_rates(marking_defaults: MarkingDefaults | None) -> None:
    if not has_default_marking_rate(marking_defaults, 1) and not has_default_marking_rate(marking_defaults, 2):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configure at least one exam-wide default marking rate (paper 1 or paper 2) before uploading special examiners",
        )


@router.get("/{examination_id}/examiner-payout-overrides/bulk-upload/template")
async def download_payout_override_template(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    examination_id: int,
) -> Response:
    await _load_examination(session, examination_id)
    marking_defaults = await load_marking_defaults(session, examination_id)
    _require_default_rates(marking_defaults)
    body = generate_payout_override_template_bytes()
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="special_examiner_template.xlsx"'
        },
    )


@router.post(
    "/{examination_id}/examiner-payout-overrides/bulk-upload",
    response_model=ExaminerPayoutOverrideBulkImportResponse,
)
async def upload_payout_overrides(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    examination_id: int,
    file: UploadFile = File(...),
) -> ExaminerPayoutOverrideBulkImportResponse:
    await _load_examination(session, examination_id)
    marking_defaults = await load_marking_defaults(session, examination_id)
    _require_default_rates(marking_defaults)
    raw = await file.read()
    if len(raw) > _MAX_BULK_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    try:
        df = read_payout_override_spreadsheet(raw, file.filename or "upload.csv")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if len(df) > _MAX_BULK_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_MAX_BULK_ROWS} data rows are allowed",
        )
    result = await bulk_upload_payout_overrides(
        session,
        examination_id=examination_id,
        marking_defaults=marking_defaults,
        df=df,
    )
    return ExaminerPayoutOverrideBulkImportResponse(
        created_count=result.created_count,
        updated_count=result.updated_count,
        errors=[
            ExaminerPayoutOverrideBulkImportRowError(row_number=e.row_number, message=e.message)
            for e in result.errors
        ],
    )


@router.patch("/{examination_id}/examiners/{examiner_id}/payout-settings")
async def update_examiner_payout_settings(
    session: DBSessionDep,
    _admin: SuperAdminOrFinanceOfficerDep,
    examination_id: int,
    examiner_id: UUID,
    body: ExaminerPayoutSettingsUpdate,
) -> dict[str, str]:
    await _load_examination(session, examination_id)
    stmt = (
        select(Examiner)
        .where(
            Examiner.id == examiner_id,
            Examiner.examination_id == examination_id,
        )
        .options(selectinload(Examiner.payout_override))
    )
    examiner = (await session.execute(stmt)).scalar_one_or_none()
    if examiner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")

    is_special = ExaminerRosterSource.from_stored(examiner.roster_source) == ExaminerRosterSource.SPECIAL
    marking_defaults = await load_marking_defaults(session, examination_id)

    if body.chief_examiners_report_count is not None:
        examiner_type = parse_examiner_type_stored(examiner.examiner_type)
        validate_report_count_for_type(
            body.chief_examiners_report_count,
            examiner_type,
        )
        examiner.chief_examiners_report_count = body.chief_examiners_report_count
        # Count drives the flag; ignore body.reporting_allowance_enabled when count is set.
        examiner.reporting_allowance_enabled = body.chief_examiners_report_count > 0
    elif body.reporting_allowance_enabled is not None:
        examiner.reporting_allowance_enabled = body.reporting_allowance_enabled

    allocation_fields = (
        body.description is not None
        or body.paper_1_script_count is not None
        or body.paper_2_script_count is not None
    )
    if allocation_fields:
        if not is_special:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Allocation settings apply only to special examiners",
            )
        override = examiner.payout_override
        if override is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Special examiner allocation not found")
        description = override.description if body.description is None else body.description
        if description is not None and len(description) > 200:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="description must be at most 200 characters")
        paper_1 = override.paper_1_script_count if body.paper_1_script_count is None else body.paper_1_script_count
        paper_2 = override.paper_2_script_count if body.paper_2_script_count is None else body.paper_2_script_count
        try:
            validate_special_allocation_counts(
                paper_1=paper_1,
                paper_2=paper_2,
                marking_defaults=marking_defaults,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        override.description = description
        override.paper_1_script_count = paper_1
        override.paper_2_script_count = paper_2

    if body.payout_adjustments is not None:
        await session.execute(
            delete(ExaminerPayoutAdjustment).where(ExaminerPayoutAdjustment.examiner_id == examiner.id)
        )
        now = datetime.utcnow()
        for idx, line in enumerate(body.payout_adjustments):
            description = line.description.strip()
            if not description:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Adjustment description is required",
                )
            session.add(
                ExaminerPayoutAdjustment(
                    id=uuid4(),
                    examiner_id=examiner.id,
                    description=description[:200],
                    amount_ghs=line.amount_ghs,
                    is_taxable=bool(line.is_taxable),
                    sort_order=idx,
                    created_at=now,
                    updated_at=now,
                )
            )

    await session.commit()
    return {"status": "ok"}
