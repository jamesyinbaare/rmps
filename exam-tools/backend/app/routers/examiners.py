from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUserDep, SuperAdminDep, SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, Examiner, ExaminerSubject, ExaminerType
from app.schemas.script_allocation import (
    ExaminerBulkImportResponse,
    ExaminerBulkImportRowError,
    ExaminerBulkSmsRequest,
    ExaminerBulkSmsResponse,
    ExaminerBulkSmsRowError,
    ExaminerCreate,
    ExaminerResponse,
    ExaminerTypeSchema,
    ExaminerUpdate,
)
from app.services.examiner_roster import dataframe_row_to_examiner_fields, read_examiners_spreadsheet
from app.services.examiner_subject_lock import assert_examiner_subject_allowed
from app.services.script_allocation import parse_region, sync_examiner_subjects
from app.services.sms.phone import normalize_msisdn
from app.services.sms.examiner_roster import maybe_send_custom_examiner_roster_sms
from app.services.template_generator import generate_examiners_bulk_template

router = APIRouter(tags=["examiners"])

_MAX_EXAMINER_BULK_BYTES = 5 * 1024 * 1024
_MAX_EXAMINER_BULK_ROWS = 2000


def _examiner_type_from_schema(s: ExaminerTypeSchema) -> ExaminerType:
    return {
        ExaminerTypeSchema.chief_examiner: ExaminerType.CHIEF,
        ExaminerTypeSchema.assistant_examiner: ExaminerType.ASSISTANT,
        ExaminerTypeSchema.team_leader: ExaminerType.TEAM_LEADER,
    }[s]


def _examiner_type_to_schema(t: ExaminerType) -> ExaminerTypeSchema:
    return {
        ExaminerType.CHIEF: ExaminerTypeSchema.chief_examiner,
        ExaminerType.ASSISTANT: ExaminerTypeSchema.assistant_examiner,
        ExaminerType.TEAM_LEADER: ExaminerTypeSchema.team_leader,
    }[t]


def _examiner_response(ex: Examiner) -> ExaminerResponse:
    gid = ex.group_membership.group_id if ex.group_membership is not None else None
    return ExaminerResponse(
        id=ex.id,
        examination_id=int(ex.examination_id),
        name=ex.name,
        phone_number=ex.phone_number,
        examiner_type=_examiner_type_to_schema(ex.examiner_type),
        region=ex.region.value,
        subject_ids=[s.subject_id for s in ex.subjects],
        deviation_weight=float(ex.deviation_weight) if ex.deviation_weight is not None else None,
        examiner_group_id=gid,
        created_at=ex.created_at,
        updated_at=ex.updated_at,
    )


async def _get_examination_or_404(session: AsyncSession, examination_id: int) -> Examination:
    row = await session.get(Examination, examination_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return row


@router.get("/examinations/{examination_id}/examiners", response_model=list[ExaminerResponse])
async def list_examiners(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
) -> list[ExaminerResponse]:
    await _get_examination_or_404(session, examination_id)
    stmt = (
        select(Examiner)
        .where(Examiner.examination_id == examination_id)
        .options(selectinload(Examiner.subjects), selectinload(Examiner.group_membership))
        .order_by(Examiner.name)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return [_examiner_response(e) for e in rows]


@router.post(
    "/examinations/{examination_id}/examiners",
    response_model=ExaminerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_examiner(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    body: ExaminerCreate,
) -> ExaminerResponse:
    await _get_examination_or_404(session, examination_id)
    try:
        region = parse_region(body.region)
        msisdn = normalize_msisdn(body.phone_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    subject_id = body.subject_ids[0]
    try:
        await assert_examiner_subject_allowed(
            session,
            examination_id=examination_id,
            msisdn=msisdn,
            subject_id=subject_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    ex = Examiner(
        examination_id=examination_id,
        name=body.name.strip(),
        phone_number=body.phone_number.strip(),
        msisdn=msisdn,
        examiner_type=_examiner_type_from_schema(body.examiner_type),
        region=region,
        deviation_weight=body.deviation_weight,
    )
    session.add(ex)
    await session.flush()
    await sync_examiner_subjects(session, ex, body.subject_ids)
    await session.commit()
    stmt = (
        select(Examiner)
        .where(Examiner.id == ex.id)
        .options(selectinload(Examiner.subjects), selectinload(Examiner.group_membership))
    )
    ex2 = (await session.execute(stmt)).scalar_one()
    return _examiner_response(ex2)


@router.get(
    "/examinations/{examination_id}/examiners/bulk-upload/template",
    summary="Download Excel template for examiner roster bulk upload",
)
async def download_examiners_bulk_template(
    session: DBSessionDep,
    _: SuperAdminDep,
    examination_id: int,
) -> Response:
    await _get_examination_or_404(session, examination_id)
    body = generate_examiners_bulk_template()
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="examiners_bulk_template.xlsx"'},
    )


@router.post(
    "/examinations/{examination_id}/examiners/bulk-upload",
    response_model=ExaminerBulkImportResponse,
)
async def bulk_upload_examiners(
    session: DBSessionDep,
    _: SuperAdminDep,
    examination_id: int,
    file: UploadFile = File(...),
) -> ExaminerBulkImportResponse:
    await _get_examination_or_404(session, examination_id)
    raw = await file.read()
    if len(raw) > _MAX_EXAMINER_BULK_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    try:
        df = read_examiners_spreadsheet(raw, file.filename or "upload.csv")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if len(df) > _MAX_EXAMINER_BULK_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_MAX_EXAMINER_BULK_ROWS} data rows are allowed",
        )
    errors: list[ExaminerBulkImportRowError] = []
    created_count = 0
    for row_number, (_, srow) in enumerate(df.iterrows(), start=2):
        try:
            fields = await dataframe_row_to_examiner_fields(session, srow)
        except ValueError as e:
            errors.append(ExaminerBulkImportRowError(row_number=row_number, message=str(e)))
            continue
        try:
            hr = parse_region(fields["allowed_region"])
            msisdn = normalize_msisdn(fields["phone_number"])
            subject_id = fields["subject_ids"][0]
            await assert_examiner_subject_allowed(
                session,
                examination_id=examination_id,
                msisdn=msisdn,
                subject_id=subject_id,
            )
        except ValueError as e:
            errors.append(ExaminerBulkImportRowError(row_number=row_number, message=str(e)))
            continue
        ex = Examiner(
            examination_id=examination_id,
            name=fields["name"],
            phone_number=fields["phone_number"],
            msisdn=msisdn,
            examiner_type=fields["examiner_type"],
            region=hr,
            deviation_weight=None,
        )
        session.add(ex)
        try:
            await session.flush()
            await sync_examiner_subjects(session, ex, fields["subject_ids"])
            await session.commit()
            created_count += 1
        except Exception as e:  # noqa: BLE001 — row-level import; surface message to admin
            await session.rollback()
            errors.append(ExaminerBulkImportRowError(row_number=row_number, message=str(e)))
    return ExaminerBulkImportResponse(created_count=created_count, errors=errors)


@router.patch("/examinations/{examination_id}/examiners/{examiner_id}", response_model=ExaminerResponse)
async def update_examiner(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    examiner_id: UUID,
    body: ExaminerUpdate,
) -> ExaminerResponse:
    stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id, Examiner.examination_id == examination_id)
        .options(selectinload(Examiner.subjects), selectinload(Examiner.group_membership))
    )
    ex = (await session.execute(stmt)).scalar_one_or_none()
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")
    patch = body.model_dump(exclude_unset=True)
    if "name" in patch and patch["name"] is not None:
        ex.name = str(patch["name"]).strip()
    if "examiner_type" in patch and patch["examiner_type"] is not None:
        ex.examiner_type = _examiner_type_from_schema(ExaminerTypeSchema(patch["examiner_type"]))
    if "region" in patch and patch["region"] is not None:
        try:
            ex.region = parse_region(patch["region"])
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if "deviation_weight" in patch:
        ex.deviation_weight = patch["deviation_weight"]
    if "phone_number" in patch and patch["phone_number"] is not None:
        try:
            ex.phone_number = str(patch["phone_number"]).strip()
            ex.msisdn = normalize_msisdn(ex.phone_number)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if "subject_ids" in patch and patch["subject_ids"] is not None:
        subject_ids = list(patch["subject_ids"])
        if len(subject_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exactly one subject is allowed per examiner",
            )
        msisdn = ex.msisdn
        if not msisdn and ex.phone_number:
            try:
                msisdn = normalize_msisdn(ex.phone_number)
                ex.msisdn = msisdn
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        if msisdn:
            try:
                await assert_examiner_subject_allowed(
                    session,
                    examination_id=examination_id,
                    msisdn=msisdn,
                    subject_id=subject_ids[0],
                    exclude_examiner_id=ex.id,
                )
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
        await sync_examiner_subjects(session, ex, subject_ids)
    await session.commit()
    stmt2 = (
        select(Examiner)
        .where(Examiner.id == ex.id)
        .options(selectinload(Examiner.subjects), selectinload(Examiner.group_membership))
    )
    ex2 = (await session.execute(stmt2)).scalar_one()
    return _examiner_response(ex2)


@router.delete("/examinations/{examination_id}/examiners/{examiner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_examiner(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    examiner_id: UUID,
) -> None:
    stmt = select(Examiner).where(Examiner.id == examiner_id, Examiner.examination_id == examination_id)
    ex = (await session.execute(stmt)).scalar_one_or_none()
    if ex is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examiner not found")
    await session.delete(ex)
    await session.commit()


@router.post(
    "/examinations/{examination_id}/examiners/bulk-sms",
    response_model=ExaminerBulkSmsResponse,
    summary="Send custom SMS to selected roster examiners",
)
async def bulk_send_examiner_roster_custom_sms(
    session: DBSessionDep,
    user: CurrentUserDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int,
    body: ExaminerBulkSmsRequest,
) -> ExaminerBulkSmsResponse:
    await _get_examination_or_404(session, examination_id)

    unique_ids = list(dict.fromkeys(body.examiner_ids))
    stmt = (
        select(Examiner)
        .where(
            Examiner.examination_id == examination_id,
            Examiner.id.in_(unique_ids),
        )
        .options(
            selectinload(Examiner.examination),
            selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject),
            selectinload(Examiner.invitation),
        )
    )
    rows = {ex.id: ex for ex in (await session.execute(stmt)).scalars().all()}

    errors: list[ExaminerBulkSmsRowError] = []
    sent_count = 0
    failed_count = 0

    for ex_id in unique_ids:
        ex = rows.get(ex_id)
        if ex is None:
            errors.append(
                ExaminerBulkSmsRowError(
                    examiner_id=ex_id,
                    message="Examiner not found for this examination",
                )
            )
            failed_count += 1
            continue
        try:
            sms_sent, sms_error, _delivery_id = await maybe_send_custom_examiner_roster_sms(
                ex,
                body.message,
                session=session,
                triggered_by_user_id=user.id,
                trigger="bulk_custom",
            )
            if sms_sent:
                sent_count += 1
            else:
                failed_count += 1
                errors.append(
                    ExaminerBulkSmsRowError(
                        examiner_id=ex_id,
                        message=sms_error or "SMS failed",
                    )
                )
        except Exception as e:  # noqa: BLE001 — per-recipient; continue batch
            await session.rollback()
            failed_count += 1
            errors.append(ExaminerBulkSmsRowError(examiner_id=ex_id, message=str(e)))

    return ExaminerBulkSmsResponse(
        sent_count=sent_count,
        failed_count=failed_count,
        errors=errors,
    )
