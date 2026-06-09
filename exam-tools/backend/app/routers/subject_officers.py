"""Super admin: subject officers and assignments; subject officer self-service."""

from __future__ import annotations

from typing import cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import asc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.security import get_password_hash
from app.dependencies.auth import SubjectOfficerDep, SuperAdminDep
from app.dependencies.database import DBSessionDep
from app.models import Examination, Subject, SubjectOfficerAssignment, User, UserRole
from app.schemas.password_reset import AdminPasswordReset, AdminPasswordResetResponse
from app.schemas.subject_officer import (
    SubjectOfficerAssignmentListResponse,
    SubjectOfficerAssignmentRow,
    SubjectOfficerAssignmentSubjectRow,
    SubjectOfficerAssignmentUpsert,
    SubjectOfficerCreate,
    SubjectOfficerCreatedResponse,
    SubjectOfficerListResponse,
    SubjectOfficerMeAssignmentsResponse,
    SubjectOfficerMeExamAssignment,
    SubjectOfficerMeAssignmentSubject,
    SubjectOfficerRow,
)
from app.services.admin_password_reset import apply_admin_password_reset
from app.services.sms.phone import normalize_msisdn
from app.services.subject_officer_scope import load_subject_officer_assignments_for_user
from app.services.sms.subject_officer_credentials import maybe_send_subject_officer_credentials

router_admin = APIRouter(prefix="/subject-officers", tags=["subject-officers"])
router_officer = APIRouter(prefix="/subject-officer", tags=["subject-officer"])

_MAX_PAGE = 100
_DEFAULT_PAGE = 20


async def _load_subject_officer_user(session: DBSessionDep, user_id: UUID) -> User:
    stmt = select(User).where(User.id == user_id, User.role == UserRole.SUBJECT_OFFICER)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject officer not found")
    return user


async def _subject_officer_assignments_by_exam(
    session: DBSessionDep,
    user_id: UUID,
) -> SubjectOfficerMeAssignmentsResponse:
    pairs = await load_subject_officer_assignments_for_user(session, user_id=user_id)
    by_exam: dict[int, SubjectOfficerMeExamAssignment] = {}
    for assignment, subject in pairs:
        exam_id = int(assignment.examination_id)
        if exam_id not in by_exam:
            exam = await session.get(Examination, exam_id)
            by_exam[exam_id] = SubjectOfficerMeExamAssignment(
                examination_id=exam_id,
                examination_name=f"{exam.exam_type} {exam.year}" if exam else "",
                subjects=[],
            )
        by_exam[exam_id].subjects.append(
            SubjectOfficerMeAssignmentSubject(
                subject_id=int(subject.id),
                subject_code=subject.code,
                subject_name=subject.name,
                subject_type=subject.subject_type.value,
                subject_original_code=subject.original_code,
            )
        )
    return SubjectOfficerMeAssignmentsResponse(items=list(by_exam.values()))


def _assignment_subject_row(subject: Subject) -> SubjectOfficerAssignmentSubjectRow:
    return SubjectOfficerAssignmentSubjectRow(
        subject_id=int(subject.id),
        subject_code=subject.code,
        subject_name=subject.name,
        subject_type=subject.subject_type.value,
        subject_original_code=subject.original_code,
    )


@router_admin.get("", response_model=SubjectOfficerListResponse)
async def list_subject_officers(
    session: DBSessionDep,
    _admin: SuperAdminDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(_DEFAULT_PAGE, ge=1, le=_MAX_PAGE),
) -> SubjectOfficerListResponse:
    count_stmt = select(func.count()).select_from(User).where(User.role == UserRole.SUBJECT_OFFICER)
    total = int(await session.scalar(count_stmt) or 0)
    stmt = (
        select(User)
        .where(User.role == UserRole.SUBJECT_OFFICER)
        .order_by(asc(User.full_name))
        .offset(skip)
        .limit(limit)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return SubjectOfficerListResponse(
        items=[
            SubjectOfficerRow(
                id=u.id,
                full_name=cast(str, u.full_name),
                email=cast(str | None, u.email),
                phone_number=cast(str | None, u.phone_number),
                is_active=bool(u.is_active),
                created_at=u.created_at,
            )
            for u in rows
        ],
        total=total,
    )


@router_admin.post("", response_model=SubjectOfficerCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_subject_officer(
    data: SubjectOfficerCreate,
    session: DBSessionDep,
    admin: SuperAdminDep,
) -> SubjectOfficerCreatedResponse:
    """Email/password sign-in via ``POST /auth/super-admin/login``; subject-scoped examiner APIs."""
    if len(data.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"password must be at least {settings.password_min_length} characters",
        )

    phone: str | None = None
    if data.phone_number and data.phone_number.strip():
        try:
            normalize_msisdn(data.phone_number)
            phone = data.phone_number.strip()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    dup_email_stmt = select(User).where(func.lower(User.email) == str(data.email).lower())
    if (await session.execute(dup_email_stmt)).scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    if phone:
        dup_phone_stmt = select(User).where(
            User.role == UserRole.SUBJECT_OFFICER,
            User.phone_number == phone,
        )
        if (await session.execute(dup_phone_stmt)).scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A subject officer with this phone number already exists",
            )

    user = User(
        email=str(data.email).lower(),
        phone_number=phone,
        full_name=data.full_name.strip(),
        role=UserRole.SUBJECT_OFFICER,
        hashed_password=get_password_hash(data.password),
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not create subject officer",
        ) from None

    sms_sent, sms_error, _delivery_id = await maybe_send_subject_officer_credentials(
        phone,
        str(data.email),
        data.password,
        data.send_sms,
        session=session,
        user_id=user.id,
        trigger="create",
        triggered_by_user_id=admin.id,
    )
    return SubjectOfficerCreatedResponse(
        id=user.id,
        full_name=user.full_name,
        email=data.email,
        phone_number=phone,
        sms_sent=sms_sent,
        sms_error=sms_error,
    )


@router_admin.post(
    "/{user_id}/reset-password",
    response_model=AdminPasswordResetResponse,
    summary="Reset a subject officer password",
)
async def reset_subject_officer_password(
    user_id: UUID,
    data: AdminPasswordReset,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> AdminPasswordResetResponse:
    if data.mode == "manual" and data.new_password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="new_password is required when mode is manual",
        )
    user = await _load_subject_officer_user(session, user_id)
    try:
        return await apply_admin_password_reset(session, user, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None


@router_admin.get(
    "/examinations/{examination_id}/assignments",
    response_model=SubjectOfficerAssignmentListResponse,
)
async def list_subject_officer_assignments(
    examination_id: int,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SubjectOfficerAssignmentListResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    stmt = (
        select(SubjectOfficerAssignment)
        .where(SubjectOfficerAssignment.examination_id == examination_id)
        .options(
            selectinload(SubjectOfficerAssignment.user),
            selectinload(SubjectOfficerAssignment.subject),
        )
        .order_by(SubjectOfficerAssignment.user_id, SubjectOfficerAssignment.subject_id)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    grouped: dict[UUID, SubjectOfficerAssignmentRow] = {}
    for row in rows:
        user = row.user
        if user is None:
            continue
        entry = grouped.get(user.id)
        subject_row = _assignment_subject_row(row.subject) if row.subject else SubjectOfficerAssignmentSubjectRow(
            subject_id=int(row.subject_id),
            subject_code="",
            subject_name="",
            subject_type="",
        )
        if entry is None:
            grouped[user.id] = SubjectOfficerAssignmentRow(
                id=row.id,
                user_id=user.id,
                full_name=cast(str, user.full_name),
                email=cast(str | None, user.email),
                phone_number=cast(str | None, user.phone_number),
                subject_ids=[int(row.subject_id)],
                subjects=[subject_row],
            )
        else:
            if int(row.subject_id) not in entry.subject_ids:
                entry.subject_ids.append(int(row.subject_id))
                entry.subjects.append(subject_row)
    return SubjectOfficerAssignmentListResponse(items=list(grouped.values()))


@router_admin.put(
    "/examinations/{examination_id}/assignments",
    response_model=SubjectOfficerAssignmentRow,
)
async def upsert_subject_officer_assignments(
    examination_id: int,
    body: SubjectOfficerAssignmentUpsert,
    session: DBSessionDep,
    admin: SuperAdminDep,
) -> SubjectOfficerAssignmentRow:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")
    user = await _load_subject_officer_user(session, body.user_id)

    unique_subject_ids = list(dict.fromkeys(body.subject_ids))
    for sid in unique_subject_ids:
        subj = await session.get(Subject, sid)
        if subj is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown subject id {sid}")

    delete_stmt = select(SubjectOfficerAssignment).where(
        SubjectOfficerAssignment.examination_id == examination_id,
        SubjectOfficerAssignment.user_id == user.id,
    )
    for old in (await session.execute(delete_stmt)).scalars().all():
        await session.delete(old)
    await session.flush()

    created_rows: list[SubjectOfficerAssignment] = []
    for sid in unique_subject_ids:
        row = SubjectOfficerAssignment(
            user_id=user.id,
            examination_id=examination_id,
            subject_id=sid,
            created_by_user_id=admin.id,
        )
        session.add(row)
        created_rows.append(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not save assignments") from None

    subjects: list[SubjectOfficerAssignmentSubjectRow] = []
    for sid in unique_subject_ids:
        subj = await session.get(Subject, sid)
        if subj is None:
            continue
        subjects.append(_assignment_subject_row(subj))
    first_id = created_rows[0].id if created_rows else user.id
    return SubjectOfficerAssignmentRow(
        id=first_id,
        user_id=user.id,
        full_name=cast(str, user.full_name),
        email=cast(str | None, user.email),
        phone_number=cast(str | None, user.phone_number),
        subject_ids=unique_subject_ids,
        subjects=subjects,
    )


@router_admin.get(
    "/{user_id}/assignments",
    response_model=SubjectOfficerMeAssignmentsResponse,
)
async def list_subject_officer_user_assignments(
    user_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> SubjectOfficerMeAssignmentsResponse:
    """All examination assignments for one subject officer (admin)."""
    await _load_subject_officer_user(session, user_id)
    return await _subject_officer_assignments_by_exam(session, user_id)


@router_admin.delete(
    "/examinations/{examination_id}/assignments/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_subject_officer_assignments(
    examination_id: int,
    user_id: UUID,
    session: DBSessionDep,
    _admin: SuperAdminDep,
) -> None:
    await _load_subject_officer_user(session, user_id)
    stmt = select(SubjectOfficerAssignment).where(
        SubjectOfficerAssignment.examination_id == examination_id,
        SubjectOfficerAssignment.user_id == user_id,
    )
    rows = list((await session.execute(stmt)).scalars().all())
    for row in rows:
        await session.delete(row)
    await session.commit()


@router_officer.get("/me/assignments", response_model=SubjectOfficerMeAssignmentsResponse)
async def get_my_subject_officer_assignments(
    session: DBSessionDep,
    user: SubjectOfficerDep,
) -> SubjectOfficerMeAssignmentsResponse:
    return await _subject_officer_assignments_by_exam(session, user.id)
