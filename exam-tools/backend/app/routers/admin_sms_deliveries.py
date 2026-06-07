"""Super-admin SMS delivery log and retry."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import aliased

from app.config import settings
from app.core.passwords import generate_inspector_password
from app.core.security import get_password_hash
from app.dependencies.auth import SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Examiner, ExaminerInvitation, RefreshToken, SmsDelivery, User, UserRole
from app.schemas.sms_delivery import (
    SmsDeliveryListResponse,
    SmsDeliveryRetry,
    SmsDeliveryRetryResponse,
    SmsDeliveryRow,
)
from app.services.sms.delivery_log import (
    MESSAGE_TYPE_EXAMINER_INVITATION,
    MESSAGE_TYPE_INSPECTOR_CREDENTIALS,
)
from app.services.sms.examiner_invitation import maybe_send_examiner_invitation_sms
from app.services.sms.inspector_credentials import maybe_send_inspector_credentials

router = APIRouter(prefix="/admin/sms-deliveries", tags=["admin-sms-deliveries"])

_MAX_PAGE_SIZE = 100
_DEFAULT_PAGE_SIZE = 20
_RETRY_DEBOUNCE_SECONDS = 60


def _row_to_schema(row: SmsDelivery, recipient_name: str) -> SmsDeliveryRow:
    return SmsDeliveryRow(
        id=row.id,
        user_id=cast(UUID | None, row.user_id),
        recipient_full_name=recipient_name,
        phone_number=row.phone_number,
        msisdn=row.msisdn,
        message_type=row.message_type,
        trigger=row.trigger,
        status=row.status,
        error_message=row.error_message,
        provider=row.provider,
        retried_from_id=row.retried_from_id,
        triggered_by_user_id=row.triggered_by_user_id,
        created_at=cast(datetime, row.created_at),
        sent_at=cast(datetime | None, row.sent_at),
    )


@router.get("", response_model=SmsDeliveryListResponse, summary="List SMS deliveries")
async def list_sms_deliveries(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    status_filter: str | None = Query(None, alias="status"),
    message_type: str | None = Query(None),
    user_id: UUID | None = Query(None),
    q: str | None = Query(None, description="Search phone or inspector name"),
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
) -> SmsDeliveryListResponse:
    filters = []
    if status_filter:
        filters.append(SmsDelivery.status == status_filter)
    if message_type:
        filters.append(SmsDelivery.message_type == message_type)
    if user_id is not None:
        filters.append(SmsDelivery.user_id == user_id)
    if from_date is not None:
        filters.append(SmsDelivery.created_at >= from_date)
    if to_date is not None:
        filters.append(SmsDelivery.created_at <= to_date)

    user_alias = aliased(User)
    inv_alias = aliased(ExaminerInvitation)
    ex_alias = aliased(Examiner)
    join_user = SmsDelivery.user_id == user_alias.id
    join_inv = SmsDelivery.examiner_invitation_id == inv_alias.id
    join_ex = SmsDelivery.examiner_id == ex_alias.id

    count_stmt = (
        select(func.count())
        .select_from(SmsDelivery)
        .outerjoin(user_alias, join_user)
        .outerjoin(inv_alias, join_inv)
        .outerjoin(ex_alias, join_ex)
    )
    list_stmt = select(
        SmsDelivery,
        func.coalesce(user_alias.full_name, inv_alias.name, ex_alias.name, SmsDelivery.phone_number).label(
            "recipient_name"
        ),
    ).outerjoin(user_alias, join_user).outerjoin(inv_alias, join_inv).outerjoin(ex_alias, join_ex)
    if filters:
        count_stmt = count_stmt.where(*filters)
        list_stmt = list_stmt.where(*filters)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        search_clause = or_(
            SmsDelivery.phone_number.ilike(pattern),
            user_alias.full_name.ilike(pattern),
            inv_alias.name.ilike(pattern),
            ex_alias.name.ilike(pattern),
        )
        count_stmt = count_stmt.where(search_clause)
        list_stmt = list_stmt.where(search_clause)

    total = int(await session.scalar(count_stmt) or 0)

    list_stmt = list_stmt.order_by(SmsDelivery.created_at.desc(), SmsDelivery.id.desc()).offset(skip).limit(limit)
    result = await session.execute(list_stmt)
    items = [_row_to_schema(row, cast(str, name)) for row, name in result.all()]
    return SmsDeliveryListResponse(items=items, total=total)


@router.get("/{delivery_id}", response_model=SmsDeliveryRow, summary="Get one SMS delivery")
async def get_sms_delivery(
    delivery_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SmsDeliveryRow:
    stmt = (
        select(
            SmsDelivery,
            func.coalesce(User.full_name, ExaminerInvitation.name, Examiner.name, SmsDelivery.phone_number).label(
                "recipient_name"
            ),
        )
        .outerjoin(User, SmsDelivery.user_id == User.id)
        .outerjoin(ExaminerInvitation, SmsDelivery.examiner_invitation_id == ExaminerInvitation.id)
        .outerjoin(Examiner, SmsDelivery.examiner_id == Examiner.id)
        .where(SmsDelivery.id == delivery_id)
    )
    result = await session.execute(stmt)
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMS delivery not found")
    delivery, full_name = row
    return _row_to_schema(delivery, cast(str, full_name))


@router.post(
    "/{delivery_id}/retry",
    response_model=SmsDeliveryRetryResponse,
    summary="Retry a failed inspector credentials SMS",
)
async def retry_sms_delivery(
    delivery_id: UUID,
    data: SmsDeliveryRetry,
    session: DBSessionDep,
    admin: SuperAdminDep,
) -> SmsDeliveryRetryResponse:
    original = await session.get(SmsDelivery, delivery_id)
    if original is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMS delivery not found")
    if original.status != "failed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only failed deliveries can be retried",
        )
    if original.message_type == MESSAGE_TYPE_INSPECTOR_CREDENTIALS:
        return await _retry_inspector_credentials_sms(
            session, original, data, admin
        )
    if original.message_type == MESSAGE_TYPE_EXAMINER_INVITATION:
        return await _retry_examiner_invitation_sms(session, original, admin)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Retry is not supported for this message type",
    )


async def _retry_inspector_credentials_sms(
    session: DBSessionDep,
    original: SmsDelivery,
    data: SmsDeliveryRetry,
    admin: User,
) -> SmsDeliveryRetryResponse:
    debounce_since = datetime.utcnow() - timedelta(seconds=_RETRY_DEBOUNCE_SECONDS)
    recent_sent = await session.execute(
        select(SmsDelivery.id).where(
            SmsDelivery.retried_from_id == original.id,
            SmsDelivery.status == "sent",
            SmsDelivery.created_at >= debounce_since,
        )
    )
    if recent_sent.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="A retry for this delivery succeeded recently; wait before retrying again",
        )

    user = await session.get(User, original.user_id)
    if user is None or user.role != UserRole.INSPECTOR:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspector not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inspector account is inactive")
    phone = cast(str | None, user.phone_number)
    if not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inspector has no phone number")

    generated_password: str | None = None
    if data.mode == "auto":
        new_password = generate_inspector_password(8)
        generated_password = new_password
    else:
        assert data.new_password is not None
        if len(data.new_password) < settings.password_min_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"password must be at least {settings.password_min_length} characters",
            )
        new_password = data.new_password

    user.hashed_password = get_password_hash(new_password)
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user.id))
    await session.commit()

    sms_sent, sms_error, new_delivery_id = await maybe_send_inspector_credentials(
        phone,
        new_password,
        True,
        session=session,
        user_id=user.id,
        trigger="retry",
        triggered_by_user_id=admin.id,
        retried_from_id=original.id,
    )
    if new_delivery_id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="SMS delivery was not logged")

    return SmsDeliveryRetryResponse(
        delivery_id=new_delivery_id,
        sms_sent=bool(sms_sent),
        sms_error=sms_error,
        generated_password=generated_password,
    )


async def _retry_examiner_invitation_sms(
    session: DBSessionDep,
    original: SmsDelivery,
    admin: User,
) -> SmsDeliveryRetryResponse:
    from sqlalchemy.orm import selectinload

    from app.models import ExaminerInvitationStatus

    if original.examiner_invitation_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation not linked")

    debounce_since = datetime.utcnow() - timedelta(seconds=_RETRY_DEBOUNCE_SECONDS)
    recent_sent = await session.execute(
        select(SmsDelivery.id).where(
            SmsDelivery.retried_from_id == original.id,
            SmsDelivery.status == "sent",
            SmsDelivery.created_at >= debounce_since,
        )
    )
    if recent_sent.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="A retry for this delivery succeeded recently; wait before retrying again",
        )

    stmt = (
        select(ExaminerInvitation)
        .where(ExaminerInvitation.id == original.examiner_invitation_id)
        .options(
            selectinload(ExaminerInvitation.subject),
            selectinload(ExaminerInvitation.examination),
        )
    )
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if inv.status not in (ExaminerInvitationStatus.PENDING, ExaminerInvitationStatus.EXPIRED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation is no longer pending",
        )

    sms_sent, sms_error, new_delivery_id = await maybe_send_examiner_invitation_sms(
        inv,
        True,
        session=session,
        triggered_by_user_id=admin.id,
        trigger="retry",
        retried_from_id=original.id,
    )
    if new_delivery_id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="SMS delivery was not logged")

    return SmsDeliveryRetryResponse(
        delivery_id=new_delivery_id,
        sms_sent=bool(sms_sent),
        sms_error=sms_error,
        generated_password=None,
    )
