from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import (
    CurrentUserDep,
    SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
)
from app.dependencies.database import DBSessionDep
from app.models import Examination, ExaminerInvitation, ExaminerInvitationStatus, ExaminerType, SmsDelivery, User
from app.schemas.examiner_invitation import (
    ExaminerInvitationBulkCoordinationResponse,
    ExaminerInvitationBulkCoordinationUpdate,
    ExaminerInvitationBulkImportResponse,
    ExaminerInvitationBulkImportRowError,
    ExaminerInvitationBulkSmsRequest,
    ExaminerInvitationBulkSmsResponse,
    ExaminerInvitationBulkSmsRowError,
    ExaminerInvitationCoordinationUpdate,
    ExaminerInvitationCreate,
    ExaminerInvitationResponse,
    ExaminerInvitationRenew,
    ExaminerInvitationRenewResponse,
    ExaminerInvitationResendResponse,
    ExaminerInvitationStatusSchema,
)
from app.schemas.script_allocation import ExaminerTypeSchema
from app.services.examiner_invitation import (
    create_examiner_invitation,
    invitation_coordination_summary,
    invitation_public_url,
    renew_examiner_invitation,
    update_invitation_coordination_schedule,
)
from app.services.examiner_roster import (
    dataframe_row_to_examiner_fields,
    parse_gender_cell,
    read_examiners_spreadsheet,
)
from app.services.sms.examiner_invitation import (
    coordination_sms_bulk_selection_error,
    coordination_sms_recipient_error,
    maybe_send_custom_examiner_invitation_sms,
    maybe_send_examiner_invitation_sms,
)
from app.services.sms.phone import normalize_msisdn
from app.services.subject_officer_scope import (
    assert_subject_officer_access,
    assert_unrestricted_examiner_manager,
    effective_subject_scope,
)
from app.services.template_generator import generate_examiner_invitations_export, generate_examiners_bulk_template

router = APIRouter(tags=["examiner-invitations"])

_MAX_BULK_BYTES = 5 * 1024 * 1024
_MAX_BULK_ROWS = 2000


def _examiner_type_from_schema(s: ExaminerTypeSchema) -> ExaminerType:
    return {
        ExaminerTypeSchema.chief_examiner: ExaminerType.CHIEF,
        ExaminerTypeSchema.assistant_chief_examiner: ExaminerType.ASSISTANT_CHIEF,
        ExaminerTypeSchema.assistant_examiner: ExaminerType.ASSISTANT,
        ExaminerTypeSchema.team_leader: ExaminerType.TEAM_LEADER,
    }[s]


def _examiner_type_to_schema(t: ExaminerType) -> ExaminerTypeSchema:
    return {
        ExaminerType.CHIEF: ExaminerTypeSchema.chief_examiner,
        ExaminerType.ASSISTANT_CHIEF: ExaminerTypeSchema.assistant_chief_examiner,
        ExaminerType.ASSISTANT: ExaminerTypeSchema.assistant_examiner,
        ExaminerType.TEAM_LEADER: ExaminerTypeSchema.team_leader,
    }[t]


async def _get_examination_or_404(session, examination_id: int) -> Examination:
    row = await session.get(Examination, examination_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    return row


async def _latest_sms_delivery(session, invitation_id: UUID) -> SmsDelivery | None:
    stmt = (
        select(SmsDelivery)
        .where(SmsDelivery.examiner_invitation_id == invitation_id)
        .order_by(SmsDelivery.created_at.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _invitation_response(inv: ExaminerInvitation, sms: SmsDelivery | None = None) -> ExaminerInvitationResponse:
    subject = inv.subject
    sms_sent: bool | None = None
    sms_error: str | None = None
    sms_delivery_id: UUID | None = None
    if sms is not None:
        sms_delivery_id = sms.id
        if sms.status == "sent":
            sms_sent = True
        elif sms.status == "failed":
            sms_sent = False
            sms_error = sms.error_message
    public_url = invitation_public_url(inv.token)
    return ExaminerInvitationResponse(
        id=inv.id,
        examination_id=int(inv.examination_id),
        subject_id=int(inv.subject_id),
        subject_name=subject.name if subject else "",
        subject_code=subject.code if subject else "",
        subject_original_code=subject.original_code if subject else None,
        subject_type=subject.subject_type.value if subject else "",
        name=inv.name,
        phone_number=inv.phone_number,
        gender=inv.gender,
        examiner_type=_examiner_type_to_schema(inv.examiner_type),
        region=inv.region.value,
        status=ExaminerInvitationStatusSchema(inv.status.value),
        invited_by_user_id=cast(UUID | None, inv.invited_by_user_id),
        notified_at=cast(datetime | None, inv.notified_at),
        responded_at=cast(datetime | None, inv.responded_at),
        response_deadline=cast(datetime, inv.response_deadline),
        **invitation_coordination_summary(inv),
        examiner_id=cast(UUID | None, inv.examiner_id),
        created_at=cast(datetime, inv.created_at),
        updated_at=cast(datetime, inv.updated_at),
        sms_sent=sms_sent,
        sms_error=sms_error,
        sms_delivery_id=sms_delivery_id,
        public_url=public_url,
    )


async def _assert_invitation_accessible(
    session,
    user: User,
    examination_id: int,
    inv: ExaminerInvitation,
) -> None:
    scope = await effective_subject_scope(session, user, examination_id)
    if scope is None:
        return
    if int(inv.subject_id) not in scope:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")


@router.get(
    "/examinations/{examination_id}/examiner-invitations",
    response_model=list[ExaminerInvitationResponse],
)
async def list_examiner_invitations(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
) -> list[ExaminerInvitationResponse]:
    await _get_examination_or_404(session, examination_id)
    scope = await effective_subject_scope(session, user, examination_id)
    if scope is not None and not scope:
        return []
    stmt = (
        select(ExaminerInvitation)
        .where(ExaminerInvitation.examination_id == examination_id)
        .options(selectinload(ExaminerInvitation.subject))
        .order_by(ExaminerInvitation.created_at.desc())
    )
    if scope is not None:
        stmt = stmt.where(ExaminerInvitation.subject_id.in_(scope))
    rows = list((await session.execute(stmt)).scalars().all())
    out: list[ExaminerInvitationResponse] = []
    for inv in rows:
        sms = await _latest_sms_delivery(session, inv.id)
        out.append(_invitation_response(inv, sms))
    return out


@router.post(
    "/examinations/{examination_id}/examiner-invitations",
    response_model=ExaminerInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_examiner_invitation_endpoint(
    session: DBSessionDep,
    user: CurrentUserDep,
    auth_user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    body: ExaminerInvitationCreate,
) -> ExaminerInvitationResponse:
    assert_unrestricted_examiner_manager(auth_user)
    await _get_examination_or_404(session, examination_id)
    await assert_subject_officer_access(session, auth_user, examination_id, body.subject_id)
    try:
        msisdn = normalize_msisdn(body.phone_number)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        gender = parse_gender_cell(body.gender)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        inv = await create_examiner_invitation(
            session,
            examination_id=examination_id,
            subject_id=body.subject_id,
            name=body.name,
            phone_number=body.phone_number.strip(),
            msisdn=msisdn,
            examiner_type=_examiner_type_from_schema(body.examiner_type),
            region_str=body.region,
            invited_by_user_id=user.id,
            response_deadline=body.response_deadline,
            coordination_start_date=body.coordination_start_date,
            coordination_start_time=body.coordination_start_time,
            coordination_end_date=body.coordination_end_date,
            coordination_end_time=body.coordination_end_time,
            coordination_venue=body.coordination_venue,
            gender=gender,
        )
        stmt_load = (
            select(ExaminerInvitation)
            .where(ExaminerInvitation.id == inv.id)
            .options(
                selectinload(ExaminerInvitation.subject),
                selectinload(ExaminerInvitation.examination),
            )
        )
        inv_loaded = (await session.execute(stmt_load)).scalar_one()
        sms_sent, sms_error, sms_delivery_id = await maybe_send_examiner_invitation_sms(
            inv_loaded,
            body.send_sms,
            session=session,
            triggered_by_user_id=user.id,
            trigger="create",
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    stmt = (
        select(ExaminerInvitation)
        .where(ExaminerInvitation.id == inv.id)
        .options(selectinload(ExaminerInvitation.subject))
    )
    inv2 = (await session.execute(stmt)).scalar_one()
    resp = _invitation_response(inv2)
    resp.sms_sent = sms_sent
    resp.sms_error = sms_error
    resp.sms_delivery_id = sms_delivery_id
    return resp


async def _get_invitation_or_404(
    session: DBSessionDep,
    examination_id: int,
    invitation_id: UUID,
) -> ExaminerInvitation:
    stmt = (
        select(ExaminerInvitation)
        .where(
            ExaminerInvitation.id == invitation_id,
            ExaminerInvitation.examination_id == examination_id,
        )
        .options(selectinload(ExaminerInvitation.subject))
    )
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    return inv


@router.patch(
    "/examinations/{examination_id}/examiner-invitations/bulk-coordination-date",
    response_model=ExaminerInvitationBulkCoordinationResponse,
    summary="Set coordination schedule on multiple examiner invitations",
)
async def bulk_set_examiner_invitation_coordination_schedule(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    body: ExaminerInvitationBulkCoordinationUpdate,
) -> ExaminerInvitationBulkCoordinationResponse:
    await _get_examination_or_404(session, examination_id)
    unique_ids = list(dict.fromkeys(body.invitation_ids))
    stmt = select(ExaminerInvitation).where(
        ExaminerInvitation.examination_id == examination_id,
        ExaminerInvitation.id.in_(unique_ids),
    )
    rows = {inv.id: inv for inv in (await session.execute(stmt)).scalars().all()}

    errors: list[ExaminerInvitationBulkSmsRowError] = []
    updated_count = 0
    for inv_id in unique_ids:
        inv = rows.get(inv_id)
        if inv is None:
            errors.append(
                ExaminerInvitationBulkSmsRowError(
                    invitation_id=inv_id,
                    message="Invitation not found for this examination",
                )
            )
            continue
        await _assert_invitation_accessible(session, user, examination_id, inv)
        await update_invitation_coordination_schedule(
            session,
            inv,
            coordination_start_date=body.coordination_start_date,
            coordination_start_time=body.coordination_start_time,
            coordination_end_date=body.coordination_end_date,
            coordination_end_time=body.coordination_end_time,
            coordination_venue=body.coordination_venue,
            update_coordination_venue="coordination_venue" in body.model_fields_set,
        )
        updated_count += 1

    await session.commit()
    return ExaminerInvitationBulkCoordinationResponse(updated_count=updated_count, errors=errors)


@router.patch(
    "/examinations/{examination_id}/examiner-invitations/{invitation_id}",
    response_model=ExaminerInvitationResponse,
    summary="Update examiner invitation (coordination schedule)",
)
async def patch_examiner_invitation(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    invitation_id: UUID,
    body: ExaminerInvitationCoordinationUpdate,
) -> ExaminerInvitationResponse:
    inv = await _get_invitation_or_404(session, examination_id, invitation_id)
    await _assert_invitation_accessible(session, user, examination_id, inv)
    fields_set = body.model_fields_set
    await update_invitation_coordination_schedule(
        session,
        inv,
        coordination_start_date=body.coordination_start_date,
        coordination_start_time=body.coordination_start_time,
        coordination_end_date=body.coordination_end_date,
        coordination_end_time=body.coordination_end_time,
        coordination_venue=body.coordination_venue,
        update_coordination_venue="coordination_venue" in fields_set,
    )
    await session.commit()
    sms = await _latest_sms_delivery(session, inv.id)
    return _invitation_response(inv, sms)


@router.post(
    "/examinations/{examination_id}/examiner-invitations/{invitation_id}/resend",
    response_model=ExaminerInvitationResendResponse,
)
async def resend_examiner_invitation_sms(
    session: DBSessionDep,
    user: CurrentUserDep,
    auth_user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    invitation_id: UUID,
) -> ExaminerInvitationResendResponse:
    stmt = (
        select(ExaminerInvitation)
        .where(
            ExaminerInvitation.id == invitation_id,
            ExaminerInvitation.examination_id == examination_id,
        )
        .options(
            selectinload(ExaminerInvitation.subject),
            selectinload(ExaminerInvitation.examination),
        )
    )
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    await _assert_invitation_accessible(session, auth_user, examination_id, inv)
    if inv.status not in (
        ExaminerInvitationStatus.PENDING,
        ExaminerInvitationStatus.EXPIRED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending or expired invitations can be resent",
        )

    sms_sent, sms_error, sms_delivery_id = await maybe_send_examiner_invitation_sms(
        inv,
        True,
        session=session,
        triggered_by_user_id=user.id,
        trigger="resend",
    )
    if sms_sent is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SMS is disabled")
    return ExaminerInvitationResendResponse(
        sms_sent=bool(sms_sent),
        sms_error=sms_error,
        sms_delivery_id=sms_delivery_id,
    )


@router.post(
    "/examinations/{examination_id}/examiner-invitations/{invitation_id}/renew",
    response_model=ExaminerInvitationRenewResponse,
    summary="Reopen an expired or declined examiner invitation with a new respond-by deadline",
)
async def renew_examiner_invitation_endpoint(
    session: DBSessionDep,
    user: CurrentUserDep,
    auth_user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    invitation_id: UUID,
    body: ExaminerInvitationRenew,
) -> ExaminerInvitationRenewResponse:
    stmt = (
        select(ExaminerInvitation)
        .where(
            ExaminerInvitation.id == invitation_id,
            ExaminerInvitation.examination_id == examination_id,
        )
        .options(
            selectinload(ExaminerInvitation.subject),
            selectinload(ExaminerInvitation.examination),
        )
    )
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    await _assert_invitation_accessible(session, auth_user, examination_id, inv)

    try:
        await renew_examiner_invitation(
            session,
            inv,
            response_deadline=body.response_deadline,
            invited_by_user_id=user.id,
        )
        sms_sent, sms_error, sms_delivery_id = await maybe_send_examiner_invitation_sms(
            inv,
            body.send_sms,
            session=session,
            triggered_by_user_id=user.id,
            trigger="renew",
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    stmt_reload = (
        select(ExaminerInvitation)
        .where(ExaminerInvitation.id == inv.id)
        .options(selectinload(ExaminerInvitation.subject))
    )
    inv2 = (await session.execute(stmt_reload)).scalar_one()
    sms = await _latest_sms_delivery(session, inv2.id)
    resp = _invitation_response(inv2, sms)
    if sms_sent is not None:
        resp.sms_sent = sms_sent
        resp.sms_error = sms_error
        resp.sms_delivery_id = sms_delivery_id
    return ExaminerInvitationRenewResponse(
        invitation=resp,
        sms_sent=sms_sent,
        sms_error=sms_error,
        sms_delivery_id=sms_delivery_id,
    )


@router.get(
    "/examinations/{examination_id}/examiner-invitations/bulk-upload/template",
    summary="Download Excel template for examiner invitation bulk upload",
)
async def download_examiner_invitations_bulk_template(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
) -> Response:
    await _get_examination_or_404(session, examination_id)
    body = generate_examiners_bulk_template()
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="examiner_invitations_bulk_template.xlsx"'},
    )


@router.post(
    "/examinations/{examination_id}/examiner-invitations/bulk-upload",
    response_model=ExaminerInvitationBulkImportResponse,
    summary="Bulk-create examiner invitations from CSV or Excel",
)
async def bulk_upload_examiner_invitations(
    session: DBSessionDep,
    user: CurrentUserDep,
    auth_user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    file: UploadFile = File(...),
    send_sms: bool = Query(False, description="Send invitation SMS for each created row"),
    response_deadline: datetime = Query(..., description="Respond-by deadline for all rows"),
    coordination_start_date: datetime | None = Query(None, description="Default coordination start date for all rows"),
    coordination_start_time: str | None = Query(None, description="Default coordination start time (HH:MM:SS)"),
    coordination_end_date: datetime | None = Query(None, description="Default coordination end date for all rows"),
    coordination_end_time: str | None = Query(None, description="Default coordination end time (HH:MM:SS)"),
) -> ExaminerInvitationBulkImportResponse:
    assert_unrestricted_examiner_manager(auth_user)
    await _get_examination_or_404(session, examination_id)
    scope = await effective_subject_scope(session, auth_user, examination_id)
    raw = await file.read()
    if len(raw) > _MAX_BULK_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
    try:
        df = read_examiners_spreadsheet(raw, file.filename or "upload.csv")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if len(df) > _MAX_BULK_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_MAX_BULK_ROWS} data rows are allowed",
        )

    from datetime import time as time_type

    def _parse_time_param(value: str | None):
        if not value or not value.strip():
            return None
        parts = value.strip().split(":")
        if len(parts) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid time format")
        return time_type(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)

    bulk_coord_start_time = _parse_time_param(coordination_start_time)
    bulk_coord_end_time = _parse_time_param(coordination_end_time)

    errors: list[ExaminerInvitationBulkImportRowError] = []
    created_count = 0
    sms_sent_count = 0
    sms_failed_count = 0

    for row_number, (_, srow) in enumerate(df.iterrows(), start=2):
        try:
            fields = await dataframe_row_to_examiner_fields(session, srow)
        except ValueError as e:
            errors.append(ExaminerInvitationBulkImportRowError(row_number=row_number, message=str(e)))
            continue
        try:
            msisdn = normalize_msisdn(fields["phone_number"])
            subject_id = fields["subject_ids"][0]
            if scope is not None and subject_id not in scope:
                raise ValueError("Subject not assigned to this officer")
        except ValueError as e:
            errors.append(ExaminerInvitationBulkImportRowError(row_number=row_number, message=str(e)))
            continue
        try:
            inv = await create_examiner_invitation(
                session,
                examination_id=examination_id,
                subject_id=subject_id,
                name=fields["name"],
                phone_number=fields["phone_number"],
                msisdn=msisdn,
                examiner_type=fields["examiner_type"],
                region_str=fields["allowed_region"],
                invited_by_user_id=user.id,
                response_deadline=response_deadline,
                coordination_start_date=coordination_start_date,
                coordination_start_time=bulk_coord_start_time,
                coordination_end_date=coordination_end_date,
                coordination_end_time=bulk_coord_end_time,
                gender=fields.get("gender"),
            )
            stmt_load = (
                select(ExaminerInvitation)
                .where(ExaminerInvitation.id == inv.id)
                .options(
                    selectinload(ExaminerInvitation.subject),
                    selectinload(ExaminerInvitation.examination),
                )
            )
            inv_loaded = (await session.execute(stmt_load)).scalar_one()
            sms_sent, _sms_error, _sms_delivery_id = await maybe_send_examiner_invitation_sms(
                inv_loaded,
                send_sms,
                session=session,
                triggered_by_user_id=user.id,
                trigger="bulk_create",
                bulk=True,
            )
            await session.commit()
            created_count += 1
            if sms_sent is True:
                sms_sent_count += 1
            elif sms_sent is False:
                sms_failed_count += 1
        except ValueError as e:
            await session.rollback()
            errors.append(ExaminerInvitationBulkImportRowError(row_number=row_number, message=str(e)))
        except Exception as e:  # noqa: BLE001 — row-level import; surface message to admin
            await session.rollback()
            errors.append(ExaminerInvitationBulkImportRowError(row_number=row_number, message=str(e)))

    return ExaminerInvitationBulkImportResponse(
        created_count=created_count,
        sms_sent_count=sms_sent_count,
        sms_failed_count=sms_failed_count,
        errors=errors,
    )


@router.post(
    "/examinations/{examination_id}/examiner-invitations/bulk-sms",
    response_model=ExaminerInvitationBulkSmsResponse,
    summary="Send custom SMS to selected examiner invitations",
)
async def bulk_send_examiner_invitation_custom_sms(
    session: DBSessionDep,
    user: CurrentUserDep,
    auth_user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    body: ExaminerInvitationBulkSmsRequest,
) -> ExaminerInvitationBulkSmsResponse:
    await _get_examination_or_404(session, examination_id)
    scope = await effective_subject_scope(session, auth_user, examination_id)

    unique_ids = list(dict.fromkeys(body.invitation_ids))
    stmt = (
        select(ExaminerInvitation)
        .where(
            ExaminerInvitation.examination_id == examination_id,
            ExaminerInvitation.id.in_(unique_ids),
        )
        .options(
            selectinload(ExaminerInvitation.subject),
            selectinload(ExaminerInvitation.examination),
        )
    )
    rows = {inv.id: inv for inv in (await session.execute(stmt)).scalars().all()}

    found_invitations = [rows[inv_id] for inv_id in unique_ids if inv_id in rows]
    bulk_block_reason = coordination_sms_bulk_selection_error(found_invitations, body.message)
    if bulk_block_reason is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=bulk_block_reason)

    errors: list[ExaminerInvitationBulkSmsRowError] = []
    sent_count = 0
    failed_count = 0

    for inv_id in unique_ids:
        inv = rows.get(inv_id)
        if inv is None:
            errors.append(
                ExaminerInvitationBulkSmsRowError(
                    invitation_id=inv_id,
                    message="Invitation not found for this examination",
                )
            )
            failed_count += 1
            continue
        if scope is not None and int(inv.subject_id) not in scope:
            errors.append(
                ExaminerInvitationBulkSmsRowError(
                    invitation_id=inv_id,
                    message="Invitation not in assigned subject scope",
                )
            )
            failed_count += 1
            continue
        skip_reason = coordination_sms_recipient_error(inv, body.message)
        if skip_reason is not None:
            errors.append(
                ExaminerInvitationBulkSmsRowError(
                    invitation_id=inv_id,
                    message=skip_reason,
                )
            )
            failed_count += 1
            continue
        try:
            sms_sent, sms_error, _delivery_id = await maybe_send_custom_examiner_invitation_sms(
                inv,
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
                    ExaminerInvitationBulkSmsRowError(
                        invitation_id=inv_id,
                        message=sms_error or "SMS failed",
                    )
                )
        except Exception as e:  # noqa: BLE001 — per-recipient; continue batch
            await session.rollback()
            failed_count += 1
            errors.append(
                ExaminerInvitationBulkSmsRowError(invitation_id=inv_id, message=str(e))
            )

    return ExaminerInvitationBulkSmsResponse(
        sent_count=sent_count,
        failed_count=failed_count,
        errors=errors,
    )


@router.get(
    "/examinations/{examination_id}/examiner-invitations/export.xlsx",
    summary="Download examiner invitation links as Excel",
)
async def export_examiner_invitations(
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    examination_id: int,
    subject_id: int | None = Query(None),
) -> Response:
    await _get_examination_or_404(session, examination_id)
    scope = await effective_subject_scope(session, user, examination_id)
    if scope is not None and not scope:
        body = generate_examiner_invitations_export([])
        return Response(
            content=body,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="examiner_invitation_links.xlsx"'},
        )
    if subject_id is not None:
        await assert_subject_officer_access(session, user, examination_id, subject_id)
    stmt = (
        select(ExaminerInvitation)
        .where(ExaminerInvitation.examination_id == examination_id)
        .options(selectinload(ExaminerInvitation.subject))
        .order_by(ExaminerInvitation.name)
    )
    if subject_id is not None:
        stmt = stmt.where(ExaminerInvitation.subject_id == subject_id)
    elif scope is not None:
        stmt = stmt.where(ExaminerInvitation.subject_id.in_(scope))
    rows = list((await session.execute(stmt)).scalars().all())
    export_rows: list[dict[str, object]] = []
    for inv in rows:
        subject = inv.subject
        export_rows.append(
            {
                "name": inv.name,
                "phone_number": inv.phone_number,
                "subject_code": subject.code if subject else "",
                "subject_name": subject.name if subject else "",
                "examiner_type": _examiner_type_to_schema(inv.examiner_type).value,
                "region": inv.region.value,
                "status": inv.status.value,
                "coordination_start_date": inv.coordination_start_date.isoformat()
                if inv.coordination_start_date
                else "",
                "coordination_end_date": inv.coordination_end_date.isoformat() if inv.coordination_end_date else "",
                "public_url": invitation_public_url(inv.token),
            }
        )
    body = generate_examiner_invitations_export(export_rows)
    return Response(
        content=body,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="examiner_invitation_links.xlsx"'},
    )
