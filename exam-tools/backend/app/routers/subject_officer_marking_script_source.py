"""Subject officer API: enter manual allocation script counts for assigned subjects."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status

from app.dependencies.auth import SubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import User
from app.schemas.examination_marking_script_source import (
    ManualMarkedScriptsUploadResponse,
    ManualMarkedScriptsUploadRowError,
    ManualMarkedScriptsUpsertRequest,
    MarkingScriptSourceResponse,
)
from app.services.examination_marking_script_source import (
    assert_examination_subject,
    build_marking_script_source_response,
    build_phone_to_examiner_map,
    load_examiners_on_subject,
    upsert_manual_marked_scripts,
)
from app.services.examiner_allocated_booklets import load_manual_marked_scripts_map
from app.services.manual_marked_scripts_upload import (
    ManualMarkedScriptsTemplateRow,
    generate_manual_marked_scripts_template_bytes,
    parse_manual_marked_scripts_upload,
    read_manual_marked_scripts_spreadsheet,
)
from app.services.subject_officer_scope import assert_subject_officer_access

router = APIRouter(tags=["subject-officer-marking-script-source"])

_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
_MAX_UPLOAD_ROWS = 5000


async def _assert_so_subject(
    session: DBSessionDep,
    user: User,
    examination_id: int,
    subject_id: int,
) -> None:
    try:
        await assert_examination_subject(session, examination_id, subject_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    await assert_subject_officer_access(session, user, examination_id, subject_id)


@router.get(
    "/examinations/{examination_id}/subject-officer/subjects/{subject_id}/marking-script-source",
    response_model=MarkingScriptSourceResponse,
)
async def get_subject_officer_marking_script_source(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    paper: int | None = Query(None, ge=1, description="Paper number for per-examiner counts"),
) -> MarkingScriptSourceResponse:
    await _assert_so_subject(session, user, examination_id, subject_id)
    return await build_marking_script_source_response(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper,
    )


@router.put(
    "/examinations/{examination_id}/subject-officer/subjects/{subject_id}/manual-marked-scripts",
    response_model=MarkingScriptSourceResponse,
)
async def upsert_subject_officer_manual_marked_scripts(
    examination_id: int,
    subject_id: int,
    body: ManualMarkedScriptsUpsertRequest,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    paper: int = Query(..., ge=1, description="Paper number for this bulk upsert"),
) -> MarkingScriptSourceResponse:
    await _assert_so_subject(session, user, examination_id, subject_id)

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
    return await build_marking_script_source_response(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        paper_number=paper,
    )


@router.get(
    "/examinations/{examination_id}/subject-officer/subjects/{subject_id}/manual-marked-scripts/upload-template",
)
async def download_subject_officer_manual_marked_scripts_template(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    paper: int = Query(..., ge=1),
) -> Response:
    await _assert_so_subject(session, user, examination_id, subject_id)
    examiners = await load_examiners_on_subject(session, examination_id, subject_id)
    manual_map = await load_manual_marked_scripts_map(session, examination_id)
    template_rows = [
        ManualMarkedScriptsTemplateRow(
            phone_number=(ex.phone_number or "").strip(),
            name=ex.name,
            ref_code=(ex.reference_code or "").strip(),
            paper=paper,
            total_allocation=manual_map.get((ex.id, subject_id, paper), "") or "",
        )
        for ex in examiners
    ]
    body = generate_manual_marked_scripts_template_bytes(rows=template_rows)
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
    "/examinations/{examination_id}/subject-officer/subjects/{subject_id}/manual-marked-scripts/upload",
    response_model=ManualMarkedScriptsUploadResponse,
)
async def upload_subject_officer_manual_marked_scripts(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    file: UploadFile = File(...),
    paper: int = Query(..., ge=1),
    validate_only: bool = Query(False),
) -> ManualMarkedScriptsUploadResponse:
    await _assert_so_subject(session, user, examination_id, subject_id)

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
