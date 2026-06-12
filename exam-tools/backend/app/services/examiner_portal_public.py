"""Build public portal payloads for invitation and roster tokens."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Examiner, ExaminerInvitationStatus, ExaminerRosterSource, ExaminerSubject
from app.services.examiner_invitation import (
    _examiner_type_label,
    _expire_if_confirmation_deadline_passed,
    _is_publicly_accessible,
    invitation_coordination_summary,
    public_invitation_view,
)
from app.services.examiner_portal import ResolvedPortalExaminer, ResolvedPortalInvitation
from app.services.examiner_portal_release import (
    appointment_letter_pending_message,
    is_appointment_letter_available,
    is_release_enabled,
    resolve_coordination_end_at,
)
from app.services.sms.examiner_appointment_letter_release import maybe_notify_on_portal_visit
from app.services.subject_marking_group import get_examiner_marking_groups


async def _marking_cohorts_for_examiner(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    examiner_id,
) -> list[dict]:
    return await get_examiner_marking_groups(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        examiner_id=examiner_id,
    )


async def _load_examiner_with_subjects(session: AsyncSession, examiner_id) -> Examiner | None:
    stmt = (
        select(Examiner)
        .where(Examiner.id == examiner_id)
        .options(selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _release_fields_for_examiner(session: AsyncSession, examiner: Examiner) -> dict:
    release_enabled = await is_release_enabled(session, int(examiner.examination_id))
    end_at = await resolve_coordination_end_at(session, examiner)
    available = await is_appointment_letter_available(session, examiner)
    pending = appointment_letter_pending_message(end_at, release_enabled=release_enabled)
    return {
        "appointment_letters_release_enabled": release_enabled,
        "appointment_letters_available": available,
        "coordination_end_at": end_at,
        "appointment_letters_pending_message": pending,
    }


async def enrich_portal_with_release(
    session: AsyncSession,
    summary: dict,
    examiner: Examiner | None,
    *,
    examination_id: int,
) -> dict:
    summary["examination_id"] = int(examination_id)
    if examiner is None:
        if examination_id is None:
            summary.update(
                {
                    "appointment_letters_release_enabled": False,
                    "appointment_letters_available": False,
                    "coordination_end_at": None,
                    "appointment_letters_pending_message": None,
                }
            )
            return summary
        release_enabled = await is_release_enabled(session, int(examination_id))
        summary.update(
            {
                "appointment_letters_release_enabled": release_enabled,
                "appointment_letters_available": False,
                "coordination_end_at": None,
                "appointment_letters_pending_message": appointment_letter_pending_message(
                    None,
                    release_enabled=release_enabled,
                ),
            }
        )
        return summary

    await maybe_notify_on_portal_visit(session, examiner)
    summary.update(await _release_fields_for_examiner(session, examiner))
    return summary


async def public_invitation_portal_view(
    session: AsyncSession,
    resolved: ResolvedPortalInvitation,
) -> dict:
    inv = resolved.invitation
    _expire_if_confirmation_deadline_passed(inv)
    summary = public_invitation_view(inv)
    summary["portal_mode"] = "invitation"
    summary["roster_source"] = ExaminerRosterSource.INVITATION.value
    summary["marking_cohorts"] = []
    summary["reference_code"] = None
    if inv.status == ExaminerInvitationStatus.QUOTA_WAITLISTED:
        from app.services.examiner_regional_quota import (
            build_quota_waitlist_portal_message,
            resolve_group_for_region,
        )

        try:
            _, group_name = await resolve_group_for_region(
                session,
                examination_id=int(inv.examination_id),
                region=inv.region,
            )
            subject = inv.subject
            summary["quota_waitlist_message"] = build_quota_waitlist_portal_message(
                invitee_name=inv.name,
                group_name=group_name,
                subject_name=subject.name if subject else "your subject",
                examiner_type=inv.examiner_type,
            )
        except ValueError:
            pass

    examiner: Examiner | None = None
    if inv.status == ExaminerInvitationStatus.ACCEPTED and inv.examiner_id is not None:
        examiner = await _load_examiner_with_subjects(session, inv.examiner_id)
        if examiner is not None:
            summary["reference_code"] = examiner.reference_code
        summary["marking_cohorts"] = await _marking_cohorts_for_examiner(
            session,
            examination_id=int(inv.examination_id),
            subject_id=int(inv.subject_id),
            examiner_id=inv.examiner_id,
        )
    return await enrich_portal_with_release(
        session,
        summary,
        examiner,
        examination_id=int(inv.examination_id),
    )


async def public_roster_portal_view(
    session: AsyncSession,
    resolved: ResolvedPortalExaminer,
) -> dict:
    examiner = resolved.examiner
    exam = resolved.examination
    subject = resolved.subject
    exam_label = f"{exam.exam_type} {exam.year}" if exam else ""
    marking_cohorts = await _marking_cohorts_for_examiner(
        session,
        examination_id=int(examiner.examination_id),
        subject_id=int(subject.id),
        examiner_id=examiner.id,
    )
    summary = {
        "invitee_name": examiner.name,
        "phone_number": examiner.phone_number or "",
        "examination_name": exam_label,
        "examination_description": exam.description if exam else None,
        "subject_name": subject.name,
        "subject_code": subject.code,
        "subject_original_code": subject.original_code,
        "examiner_type": examiner.examiner_type.value,
        "examiner_type_label": _examiner_type_label(examiner.examiner_type),
        "region": examiner.region.value,
        "status": ExaminerInvitationStatus.ACCEPTED.value,
        "response_deadline": None,
        "coordination_start_date": None,
        "coordination_start_time": None,
        "coordination_end_date": None,
        "coordination_end_time": None,
        "responded_at": None,
        "can_respond": False,
        "examiner_id": examiner.id,
        "portal_mode": "roster",
        "roster_source": examiner.roster_source.value,
        "marking_cohorts": marking_cohorts,
        "reference_code": examiner.reference_code,
    }
    loaded = await _load_examiner_with_subjects(session, examiner.id)
    return await enrich_portal_with_release(
        session,
        summary,
        loaded or examiner,
        examination_id=int(examiner.examination_id),
    )


def invitation_is_publicly_accessible(resolved: ResolvedPortalInvitation) -> bool:
    return _is_publicly_accessible(resolved.invitation)
