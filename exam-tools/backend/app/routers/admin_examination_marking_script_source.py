"""Admin API: manual vs allocation marking script source per subject."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import ExaminerType, MarkingScriptSourceMode
from app.schemas.examination_marking_script_source import (
    ManualMarkedScriptsUploadResponse,
    ManualMarkedScriptsUploadRowError,
    ManualMarkedScriptsUpsertRequest,
    MarkingScriptSourceExaminerRow,
    MarkingScriptSourceResponse,
    MarkingScriptSourceUpdate,
)
from app.services.examination_marking_script_source import (
    assert_examination_subject,
    build_phone_to_examiner_map,
    get_subject_source_mode,
    list_papers_for_subject,
    load_examiners_on_subject,
    set_subject_source_mode,
    upsert_manual_marked_scripts,
)
from app.services.examiner_allocated_booklets import (
    load_allocated_booklets_map,
    load_effective_allocated_booklets_map,
    load_manual_marked_scripts_map,
)
from app.services.manual_marked_scripts_upload import (
    generate_manual_marked_scripts_template_bytes,
    parse_manual_marked_scripts_upload,
    read_manual_marked_scripts_spreadsheet,
)

router = APIRouter(prefix="/admin/examinations", tags=["admin-marking-script-source"])

_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
_MAX_UPLOAD_ROWS = 5000


def _examiner_type_label(t: ExaminerType) -> str:
    return {
        ExaminerType.CHIEF: "chief_examiner",
        ExaminerType.ASSISTANT_CHIEF: "assistant_chief_examiner",
        ExaminerType.ASSISTANT: "assistant_examiner",
        ExaminerType.TEAM_LEADER: "team_leader",
    }[t]


def _parse_source_mode(raw: str) -> MarkingScriptSourceMode:
    value = raw.strip().lower()
    if value == MarkingScriptSourceMode.ALLOCATION.value:
        return MarkingScriptSourceMode.ALLOCATION
    if value == MarkingScriptSourceMode.MANUAL.value:
        return MarkingScriptSourceMode.MANUAL
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="source_mode must be allocation or manual",
    )


async def _build_marking_script_source_response(
    session: DBSessionDep,
    *,
    examination_id: int,
    subject_id: int,
    paper_number: int | None,
) -> MarkingScriptSourceResponse:
    source_mode = await get_subject_source_mode(session, examination_id, subject_id)
    available_papers = await list_papers_for_subject(session, examination_id, subject_id)
    allocation_map = await load_allocated_booklets_map(session, examination_id)
    manual_map = await load_manual_marked_scripts_map(session, examination_id)
    effective_map = await load_effective_allocated_booklets_map(session, examination_id)
    examiners = await load_examiners_on_subject(session, examination_id, subject_id)

    rows: list[MarkingScriptSourceExaminerRow] = []
    for ex in examiners:
        alloc_count = 0
        manual_count = 0
        effective_count = 0
        if paper_number is not None:
            key = (ex.id, subject_id, paper_number)
            alloc_count = allocation_map.get(key, 0)
            manual_count = manual_map.get(key, 0)
            effective_count = effective_map.get(key, 0)
        rows.append(
            MarkingScriptSourceExaminerRow(
                examiner_id=ex.id,
                name=ex.name,
                examiner_type=_examiner_type_label(ex.examiner_type),
                phone_number=ex.phone_number,
                allocation_count=alloc_count,
                manual_count=manual_count,
                effective_count=effective_count,
            )
        )

    return MarkingScriptSourceResponse(
        examination_id=examination_id,
        subject_id=subject_id,
        source_mode=source_mode.value,
        available_papers=available_papers,
        paper_number=paper_number,
        examiners=rows,
    )


@router.get(
    "/{examination_id}/subjects/{subject_id}/marking-script-source",
    response_model=MarkingScriptSourceResponse,
)
async def get_marking_script_source(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    paper: int | None = Query(None, ge=1, description="Paper number for per-examiner counts"),
) -> MarkingScriptSourceResponse:
    try:
        await assert_examination_subject(session, examination_id, subject_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return await _build_marking_script_source_response(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper,
    )


@router.put(
    "/{examination_id}/subjects/{subject_id}/marking-script-source",
    response_model=MarkingScriptSourceResponse,
)
async def update_marking_script_source(
    examination_id: int,
    subject_id: int,
    body: MarkingScriptSourceUpdate,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
) -> MarkingScriptSourceResponse:
    try:
        await assert_examination_subject(session, examination_id, subject_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    mode = _parse_source_mode(body.source_mode)
    await set_subject_source_mode(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        source_mode=mode,
        updated_by_user_id=user.id,
    )
    await session.commit()
    return await _build_marking_script_source_response(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=None,
    )


@router.put(
    "/{examination_id}/subjects/{subject_id}/manual-marked-scripts",
    response_model=MarkingScriptSourceResponse,
)
async def upsert_manual_marked_scripts_endpoint(
    examination_id: int,
    subject_id: int,
    body: ManualMarkedScriptsUpsertRequest,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    paper: int = Query(..., ge=1, description="Paper number for this bulk upsert"),
) -> MarkingScriptSourceResponse:
    try:
        await assert_examination_subject(session, examination_id, subject_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    subject_examiners = await load_examiners_on_subject(session, examination_id, subject_id)
    allowed_ids = {ex.id for ex in subject_examiners}
    items: list[tuple[UUID, int]] = []
    for item in body.items:
        if item.paper_number != paper:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"All items must use paper_number={paper}",
            )
        if item.examiner_id not in allowed_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Examiner {item.examiner_id} is not assigned to this subject",
            )
        items.append((item.examiner_id, item.script_count))

    await upsert_manual_marked_scripts(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper,
        items=items,
        updated_by_user_id=user.id,
    )
    await session.commit()
    return await _build_marking_script_source_response(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper,
    )


@router.get(
    "/{examination_id}/subjects/{subject_id}/manual-marked-scripts/upload-template",
)
async def download_manual_marked_scripts_template(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    paper: int = Query(..., ge=1),
) -> Response:
    try:
        await assert_examination_subject(session, examination_id, subject_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    examiners = await load_examiners_on_subject(session, examination_id, subject_id)
    body = generate_manual_marked_scripts_template_bytes(
        examiner_names=[(ex.name, ex.phone_number) for ex in examiners],
    )
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f'attachment; filename="manual_marked_scripts_ex{examination_id}_'
                f"sub{subject_id}_p{paper}.xlsx\""
            ),
        },
    )


@router.post(
    "/{examination_id}/subjects/{subject_id}/manual-marked-scripts/upload",
    response_model=ManualMarkedScriptsUploadResponse,
)
async def upload_manual_marked_scripts(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
    file: UploadFile = File(...),
    paper: int = Query(..., ge=1),
    validate_only: bool = Query(False),
) -> ManualMarkedScriptsUploadResponse:
    try:
        await assert_examination_subject(session, examination_id, subject_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    try:
        df = read_manual_marked_scripts_spreadsheet(raw, file.filename or "upload.csv")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if len(df) > _MAX_UPLOAD_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_MAX_UPLOAD_ROWS} data rows are allowed",
        )

    examiners = await load_examiners_on_subject(session, examination_id, subject_id)
    phone_map = build_phone_to_examiner_map(examiners)
    parsed = parse_manual_marked_scripts_upload(df, phone_to_examiner_id=phone_map)

    has_duplicate = any("Duplicate phone_number" in e.message for e in parsed.errors)
    if has_duplicate:
        return ManualMarkedScriptsUploadResponse(
            applied_count=0,
            skipped_count=parsed.skipped_count,
            errors=[ManualMarkedScriptsUploadRowError(row_number=e.row_number, message=e.message) for e in parsed.errors],
            validate_only=validate_only,
        )

    if not validate_only:
        await upsert_manual_marked_scripts(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            paper_number=paper,
            items=parsed.items,
            updated_by_user_id=user.id,
        )
        await session.commit()

    return ManualMarkedScriptsUploadResponse(
        applied_count=parsed.applied_count,
        skipped_count=parsed.skipped_count,
        errors=[ManualMarkedScriptsUploadRowError(row_number=e.row_number, message=e.message) for e in parsed.errors],
        validate_only=validate_only,
    )
