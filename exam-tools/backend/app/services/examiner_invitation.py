"""Examiner invitation lifecycle: create, accept, decline."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
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
from app.services.coordination_schedule import format_coordination_range, validate_coordination_range
from app.services.examiner_reference_code import assign_reference_code_to_examiner
from app.services.examiner_regional_quota import (
    assert_examiner_regional_quota_allowed,
    build_quota_waitlist_portal_message,
    would_exceed_quota,
)
from app.services.examiner_subject_lock import assert_examiner_subject_allowed
from app.services.script_allocation import parse_region, sync_examiner_subjects
from app.services.sms.phone import normalize_msisdn
from app.services.subject_marking_group import sync_subject_cohort_memberships


@dataclass(frozen=True)
class AcceptInvitationResult:
    outcome: Literal["accepted", "quota_waitlisted"]
    examiner: Examiner | None = None
    quota_waitlist_message: str | None = None
    region_group_name: str | None = None


def generate_invitation_token() -> str:
    return secrets.token_urlsafe(settings.examiner_invitation_token_bytes)


def invitation_public_url(token: str) -> str:
    base = settings.examiner_invitation_base_url.rstrip("/")
    path = settings.examiner_invitation_link_path.strip("/")
    return f"{base}/{path}/{token}"


def _examiner_type_label(examiner_type: ExaminerType) -> str:
    return {
        ExaminerType.CHIEF: "Chief examiner",
        ExaminerType.ASSISTANT_CHIEF: "Assistant chief examiner",
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
        inv.status in (ExaminerInvitationStatus.PENDING, ExaminerInvitationStatus.QUOTA_WAITLISTED)
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
        ExaminerInvitationStatus.QUOTA_WAITLISTED,
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
    coordination_start_date: datetime | None = None,
    coordination_start_time=None,
    coordination_end_date: datetime | None = None,
    coordination_end_time=None,
    coordination_venue: str | None = None,
    gender: str | None = None,
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
    validate_coordination_range(
        coordination_start_date,
        coordination_start_time,
        coordination_end_date,
        coordination_end_time,
    )
    token = generate_invitation_token()
    inv = ExaminerInvitation(
        examination_id=examination_id,
        subject_id=subject_id,
        name=name.strip(),
        phone_number=phone_number,
        msisdn=msisdn,
        gender=gender,
        examiner_type=examiner_type,
        region=region,
        token=token,
        token_expires_at=deadline,
        status=ExaminerInvitationStatus.PENDING,
        invited_by_user_id=invited_by_user_id,
        response_deadline=deadline,
        coordination_start_date=_as_naive_utc(coordination_start_date),
        coordination_start_time=coordination_start_time,
        coordination_end_date=_as_naive_utc(coordination_end_date),
        coordination_end_time=coordination_end_time,
        coordination_venue=(coordination_venue or "").strip() or None,
    )
    session.add(inv)
    await session.flush()
    return inv


async def accept_examiner_invitation(session: AsyncSession, inv: ExaminerInvitation) -> AcceptInvitationResult:
    if inv.status == ExaminerInvitationStatus.ACCEPTED and inv.examiner_id is not None:
        examiner = await session.get(
            Examiner,
            inv.examiner_id,
            options=(selectinload(Examiner.subjects),),
        )
        if examiner is not None:
            return AcceptInvitationResult(outcome="accepted", examiner=examiner)
    if _expire_if_confirmation_deadline_passed(inv):
        await session.flush()
        raise ValueError("The respond-by deadline for this invitation has passed.")
    if inv.status not in (
        ExaminerInvitationStatus.PENDING,
        ExaminerInvitationStatus.QUOTA_WAITLISTED,
    ):
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

    quota_check = await would_exceed_quota(
        session,
        examination_id=int(inv.examination_id),
        subject_id=int(inv.subject_id),
        region=inv.region,
        examiner_type=inv.examiner_type,
        gender=inv.gender,
    )
    if quota_check.exceeded:
        now = datetime.utcnow()
        inv.status = ExaminerInvitationStatus.QUOTA_WAITLISTED
        if inv.responded_at is None:
            inv.responded_at = now
        await session.flush()

        subject = inv.subject
        subject_name = subject.name if subject else "your subject"
        portal_message = build_quota_waitlist_portal_message(
            invitee_name=inv.name,
            group_name=quota_check.group_name or "your region group",
            subject_name=subject_name,
            examiner_type=inv.examiner_type,
        )
        return AcceptInvitationResult(
            outcome="quota_waitlisted",
            quota_waitlist_message=portal_message,
            region_group_name=quota_check.group_name,
        )

    examiner = Examiner(
        examination_id=inv.examination_id,
        name=inv.name,
        examiner_type=inv.examiner_type,
        region=inv.region,
        phone_number=inv.phone_number,
        msisdn=inv.msisdn,
        gender=inv.gender,
        portal_token=inv.token,
        roster_source=ExaminerRosterSource.INVITATION,
    )
    session.add(examiner)
    await session.flush()
    await sync_examiner_subjects(session, examiner, [inv.subject_id])
    await assign_reference_code_to_examiner(
        session,
        examiner,
        subject_id=int(inv.subject_id),
    )
    await sync_subject_cohort_memberships(
        session,
        examination_id=int(inv.examination_id),
        subject_id=int(inv.subject_id),
    )

    now = datetime.utcnow()
    inv.status = ExaminerInvitationStatus.ACCEPTED
    inv.examiner_id = examiner.id
    inv.responded_at = now
    inv.msisdn = None
    await session.flush()
    return AcceptInvitationResult(outcome="accepted", examiner=examiner)


async def decline_examiner_invitation(session: AsyncSession, inv: ExaminerInvitation) -> None:
    if inv.status == ExaminerInvitationStatus.DECLINED:
        return
    if _expire_if_confirmation_deadline_passed(inv):
        await session.flush()
        raise ValueError("The respond-by deadline for this invitation has passed.")
    if inv.status not in (
        ExaminerInvitationStatus.PENDING,
        ExaminerInvitationStatus.QUOTA_WAITLISTED,
    ):
        raise ValueError("This invitation is no longer available.")
    inv.status = ExaminerInvitationStatus.DECLINED
    inv.responded_at = datetime.utcnow()
    await session.flush()


_EDITABLE_INVITATION_STATUSES = (
    ExaminerInvitationStatus.PENDING,
    ExaminerInvitationStatus.EXPIRED,
    ExaminerInvitationStatus.DECLINED,
    ExaminerInvitationStatus.QUOTA_WAITLISTED,
    ExaminerInvitationStatus.ACCEPTED,
)


async def update_examiner_invitation_details(
    session: AsyncSession,
    inv: ExaminerInvitation,
    *,
    name: str | None = None,
    examiner_type: ExaminerType | None = None,
) -> ExaminerInvitation:
    if inv.status not in _EDITABLE_INVITATION_STATUSES:
        raise ValueError(f"Cannot edit invitation in {inv.status.value} status.")

    if name is None and examiner_type is None:
        raise ValueError("Provide name and/or examiner type to update.")

    new_name = inv.name
    if name is not None:
        stripped = name.strip()
        if not stripped:
            raise ValueError("Name is required.")
        new_name = stripped

    new_type = examiner_type if examiner_type is not None else inv.examiner_type
    type_changed = examiner_type is not None and new_type != inv.examiner_type

    if type_changed:
        exclude_examiner_id: UUID | None = None
        if inv.status == ExaminerInvitationStatus.ACCEPTED and inv.examiner_id is not None:
            exclude_examiner_id = inv.examiner_id
        await assert_examiner_regional_quota_allowed(
            session,
            examination_id=int(inv.examination_id),
            subject_id=int(inv.subject_id),
            region=inv.region,
            examiner_type=new_type,
            gender=inv.gender,
            exclude_examiner_id=exclude_examiner_id,
        )

    inv.name = new_name
    if examiner_type is not None:
        inv.examiner_type = new_type
    inv.updated_at = datetime.utcnow()
    await session.flush()

    if inv.status == ExaminerInvitationStatus.ACCEPTED and inv.examiner_id is not None:
        examiner = await session.get(
            Examiner,
            inv.examiner_id,
            options=(selectinload(Examiner.subjects),),
        )
        if examiner is not None:
            examiner.name = new_name
            if examiner_type is not None:
                examiner.examiner_type = new_type
            examiner.updated_at = datetime.utcnow()
            await session.flush()

    return inv


async def delete_examiner_invitation(
    session: AsyncSession,
    examination_id: int,
    inv: ExaminerInvitation,
    *,
    confirm_remove_allocations: bool = False,
) -> None:
    from app.services.examiner_delete import (
        build_examiner_delete_impact,
        delete_examiner_with_cleanup,
        load_examiner_for_delete,
    )

    if inv.status == ExaminerInvitationStatus.ACCEPTED and inv.examiner_id is not None:
        examiner = await load_examiner_for_delete(session, examination_id, inv.examiner_id)
        if examiner is None:
            await session.delete(inv)
            await session.flush()
            return

        impact = await build_examiner_delete_impact(session, examination_id, examiner)
        if impact.requires_confirmation and not confirm_remove_allocations:
            raise ValueError(impact.model_dump_json())

        await delete_examiner_with_cleanup(session, examination_id, examiner)
        return

    await session.delete(inv)
    await session.flush()


async def update_invitation_coordination_schedule(
    session: AsyncSession,
    inv: ExaminerInvitation,
    *,
    coordination_start_date: datetime | None,
    coordination_start_time,
    coordination_end_date: datetime | None,
    coordination_end_time,
    coordination_venue: str | None = None,
    update_coordination_venue: bool = False,
) -> ExaminerInvitation:
    validate_coordination_range(
        coordination_start_date,
        coordination_start_time,
        coordination_end_date,
        coordination_end_time,
    )
    inv.coordination_start_date = _as_naive_utc(coordination_start_date)
    inv.coordination_start_time = coordination_start_time
    inv.coordination_end_date = _as_naive_utc(coordination_end_date)
    inv.coordination_end_time = coordination_end_time
    if update_coordination_venue:
        inv.coordination_venue = (coordination_venue or "").strip() or None
    inv.updated_at = datetime.utcnow()
    await session.flush()
    return inv


def invitation_coordination_summary(inv: ExaminerInvitation) -> dict:
    from app.services.coordination_schedule import coordination_end_at

    return {
        "coordination_start_date": inv.coordination_start_date,
        "coordination_start_time": inv.coordination_start_time,
        "coordination_end_date": inv.coordination_end_date,
        "coordination_end_time": inv.coordination_end_time,
        "coordination_end_at": coordination_end_at(inv.coordination_end_date, inv.coordination_end_time),
        "coordination_venue": inv.coordination_venue,
    }


async def update_examiner_invitation_response_deadline(
    session: AsyncSession,
    inv: ExaminerInvitation,
    *,
    response_deadline: datetime,
) -> ExaminerInvitation:
    if inv.status not in (
        ExaminerInvitationStatus.PENDING,
        ExaminerInvitationStatus.QUOTA_WAITLISTED,
        ExaminerInvitationStatus.EXPIRED,
    ):
        raise ValueError(
            "Only pending, quota-waitlisted, or expired invitations can have their respond-by date updated."
        )

    deadline = _as_naive_utc(response_deadline)
    if deadline is None:
        raise ValueError("Respond-by deadline is required.")
    if deadline < datetime.utcnow():
        raise ValueError("Respond-by deadline must be in the future.")

    if inv.status == ExaminerInvitationStatus.EXPIRED:
        inv.status = ExaminerInvitationStatus.PENDING

    inv.response_deadline = deadline
    inv.token_expires_at = deadline
    inv.updated_at = datetime.utcnow()
    await session.flush()
    return inv


async def renew_examiner_invitation(
    session: AsyncSession,
    inv: ExaminerInvitation,
    *,
    response_deadline: datetime,
    invited_by_user_id: UUID,
) -> ExaminerInvitation:
    if inv.status not in (
        ExaminerInvitationStatus.EXPIRED,
        ExaminerInvitationStatus.DECLINED,
        ExaminerInvitationStatus.QUOTA_WAITLISTED,
    ):
        raise ValueError("Only expired, declined, or quota-waitlisted invitations can be reopened.")

    deadline = _as_naive_utc(response_deadline)
    if deadline is None:
        raise ValueError("Respond-by deadline is required.")
    if deadline < datetime.utcnow():
        raise ValueError("Respond-by deadline must be in the future.")

    msisdn = inv.msisdn
    if not msisdn or not str(msisdn).strip():
        msisdn = normalize_msisdn(inv.phone_number)
        inv.msisdn = msisdn

    await assert_examiner_subject_allowed(
        session,
        examination_id=int(inv.examination_id),
        msisdn=msisdn,
        subject_id=int(inv.subject_id),
        allow_pending_invitation_id=inv.id,
    )

    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = deadline
    inv.token_expires_at = deadline
    inv.responded_at = None
    inv.invited_by_user_id = invited_by_user_id
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
        "examination_type": exam.exam_type if exam else None,
        "examination_year": exam.year if exam else None,
        "examination_description": exam.description if exam else None,
        "subject_name": subject.name if subject else "",
        "subject_code": subject.code if subject else "",
        "subject_original_code": (subject.original_code if subject else None),
        "examiner_type": inv.examiner_type.value,
        "examiner_type_label": _examiner_type_label(inv.examiner_type),
        "region": inv.region.value,
        "status": inv.status.value,
        "response_deadline": inv.response_deadline,
        **invitation_coordination_summary(inv),
        "responded_at": inv.responded_at,
    }


def public_invitation_view(inv: ExaminerInvitation) -> dict:
    """Build public GET payload; may transition pending → expired when deadline passed."""
    _expire_if_confirmation_deadline_passed(inv)
    summary = invitation_summary(inv)
    summary["can_respond"] = _is_confirmation_open(inv)
    summary["examiner_id"] = inv.examiner_id if inv.status == ExaminerInvitationStatus.ACCEPTED else None
    summary["quota_waitlist_message"] = None
    if inv.status == ExaminerInvitationStatus.QUOTA_WAITLISTED:
        subject = inv.subject
        subject_name = subject.name if subject else "your subject"
        summary["quota_waitlist_message"] = build_quota_waitlist_portal_message(
            invitee_name=inv.name,
            group_name="your region group",
            subject_name=subject_name,
            examiner_type=inv.examiner_type,
        )
    return summary
