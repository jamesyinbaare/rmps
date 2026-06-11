"""Examiner invitation lifecycle: create, accept, decline."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import (
    Examiner,
    ExaminerInvitation,
    ExaminerInvitationStatus,
    ExaminerRosterSource,
    ExaminerType,
    Examination,
    Subject,
)
from app.services.examiner_subject_lock import assert_examiner_subject_allowed
from app.services.script_allocation import parse_region, sync_examiner_subjects
from app.services.subject_marking_group import sync_default_cohort_members


def generate_invitation_token() -> str:
    return secrets.token_urlsafe(settings.examiner_invitation_token_bytes)


def invitation_public_url(token: str) -> str:
    base = settings.examiner_invitation_base_url.rstrip("/")
    path = settings.examiner_invitation_link_path.strip("/")
    return f"{base}/{path}/{token}"


def _examiner_type_label(examiner_type: ExaminerType) -> str:
    return {
        ExaminerType.CHIEF: "Chief examiner",
        ExaminerType.ASSISTANT: "Assistant examiner",
        ExaminerType.TEAM_LEADER: "Team leader",
    }[examiner_type]


def subject_display_code(subject: Subject | None) -> str:
    if subject is None:
        return ""
    orig = (subject.original_code or "").strip()
    return orig if orig else subject.code


async def get_invitation_by_token(session: AsyncSession, token: str) -> ExaminerInvitation | None:
    stmt = (
        select(ExaminerInvitation)
        .where(ExaminerInvitation.token == token)
        .options(
            selectinload(ExaminerInvitation.examination),
            selectinload(ExaminerInvitation.subject),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _is_confirmation_open(inv: ExaminerInvitation) -> bool:
    return (
        inv.status == ExaminerInvitationStatus.PENDING
        and inv.response_deadline >= datetime.utcnow()
    )


def _expire_if_confirmation_deadline_passed(inv: ExaminerInvitation) -> bool:
    """Mark pending invitations past response_deadline as expired. Returns True if status changed."""
    if (
        inv.status == ExaminerInvitationStatus.PENDING
        and inv.response_deadline < datetime.utcnow()
    ):
        inv.status = ExaminerInvitationStatus.EXPIRED
        return True
    return False


def _is_publicly_accessible(inv: ExaminerInvitation) -> bool:
    return inv.status in (
        ExaminerInvitationStatus.PENDING,
        ExaminerInvitationStatus.ACCEPTED,
        ExaminerInvitationStatus.DECLINED,
    )


def _as_naive_utc(dt: datetime | None) -> datetime | None:
    """Convert aware datetimes to naive UTC for TIMESTAMP WITHOUT TIME ZONE columns."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


async def create_examiner_invitation(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    name: str,
    phone_number: str,
    msisdn: str,
    examiner_type: ExaminerType,
    region_str: str,
    invited_by_user_id: UUID,
    response_deadline: datetime,
    coordination_date: datetime | None = None,
) -> ExaminerInvitation:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")
    subject = await session.get(Subject, subject_id)
    if subject is None:
        raise ValueError("Subject not found")

    await assert_examiner_subject_allowed(
        session,
        examination_id=examination_id,
        msisdn=msisdn,
        subject_id=subject_id,
    )

    region = parse_region(region_str)
    deadline = _as_naive_utc(response_deadline)
    if deadline is None:
        raise ValueError("Respond-by deadline is required.")
    token = generate_invitation_token()
    inv = ExaminerInvitation(
        examination_id=examination_id,
        subject_id=subject_id,
        name=name.strip(),
        phone_number=phone_number,
        msisdn=msisdn,
        examiner_type=examiner_type,
        region=region,
        token=token,
        token_expires_at=deadline,
        status=ExaminerInvitationStatus.PENDING,
        invited_by_user_id=invited_by_user_id,
        response_deadline=deadline,
        coordination_date=_as_naive_utc(coordination_date),
    )
    session.add(inv)
    await session.flush()
    return inv


async def accept_examiner_invitation(session: AsyncSession, inv: ExaminerInvitation) -> Examiner:
    if inv.status == ExaminerInvitationStatus.ACCEPTED and inv.examiner_id is not None:
        examiner = await session.get(
            Examiner,
            inv.examiner_id,
            options=(selectinload(Examiner.subjects),),
        )
        if examiner is not None:
            return examiner
    if _expire_if_confirmation_deadline_passed(inv):
        await session.flush()
        raise ValueError("The respond-by deadline for this invitation has passed.")
    if inv.status != ExaminerInvitationStatus.PENDING:
        raise ValueError("This invitation is no longer available.")

    existing = (
        await session.execute(
            select(Examiner).where(
                Examiner.examination_id == inv.examination_id,
                Examiner.msisdn == inv.msisdn,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError("This person is already on the examiner roster for this examination.")

    examiner = Examiner(
        examination_id=inv.examination_id,
        name=inv.name,
        examiner_type=inv.examiner_type,
        region=inv.region,
        phone_number=inv.phone_number,
        msisdn=inv.msisdn,
        portal_token=inv.token,
        roster_source=ExaminerRosterSource.INVITATION,
    )
    session.add(examiner)
    await session.flush()
    await sync_examiner_subjects(session, examiner, [inv.subject_id])
    await sync_default_cohort_members(
        session,
        examination_id=int(inv.examination_id),
        subject_id=int(inv.subject_id),
    )

    now = datetime.utcnow()
    inv.status = ExaminerInvitationStatus.ACCEPTED
    inv.examiner_id = examiner.id
    inv.responded_at = now
    await session.flush()
    return examiner


async def decline_examiner_invitation(session: AsyncSession, inv: ExaminerInvitation) -> None:
    if inv.status == ExaminerInvitationStatus.DECLINED:
        return
    if _expire_if_confirmation_deadline_passed(inv):
        await session.flush()
        raise ValueError("The respond-by deadline for this invitation has passed.")
    if inv.status != ExaminerInvitationStatus.PENDING:
        raise ValueError("This invitation is no longer available.")
    inv.status = ExaminerInvitationStatus.DECLINED
    inv.responded_at = datetime.utcnow()
    await session.flush()


async def update_invitation_coordination_date(
    session: AsyncSession,
    inv: ExaminerInvitation,
    coordination_date: datetime | None,
) -> ExaminerInvitation:
    inv.coordination_date = _as_naive_utc(coordination_date)
    inv.updated_at = datetime.utcnow()
    await session.flush()
    return inv


def invitation_summary(inv: ExaminerInvitation) -> dict:
    exam = inv.examination
    subject = inv.subject
    return {
        "invitee_name": inv.name,
        "phone_number": inv.phone_number,
        "examination_name": f"{exam.exam_type} {exam.year}" if exam else "",
        "examination_description": exam.description if exam else None,
        "subject_name": subject.name if subject else "",
        "subject_code": subject.code if subject else "",
        "subject_original_code": (subject.original_code if subject else None),
        "examiner_type": inv.examiner_type.value,
        "examiner_type_label": _examiner_type_label(inv.examiner_type),
        "region": inv.region.value,
        "status": inv.status.value,
        "response_deadline": inv.response_deadline,
        "coordination_date": inv.coordination_date,
        "responded_at": inv.responded_at,
    }


def public_invitation_view(inv: ExaminerInvitation) -> dict:
    """Build public GET payload; may transition pending → expired when deadline passed."""
    _expire_if_confirmation_deadline_passed(inv)
    summary = invitation_summary(inv)
    summary["can_respond"] = _is_confirmation_open(inv)
    summary["examiner_id"] = inv.examiner_id if inv.status == ExaminerInvitationStatus.ACCEPTED else None
    return summary
