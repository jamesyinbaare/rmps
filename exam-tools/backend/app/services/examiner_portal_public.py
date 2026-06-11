"""Build public portal payloads for invitation and roster tokens."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ExaminerInvitationStatus, ExaminerRosterSource
from app.services.examiner_invitation import (
    _examiner_type_label,
    _expire_if_confirmation_deadline_passed,
    _is_publicly_accessible,
    public_invitation_view,
)
from app.services.examiner_portal import ResolvedPortalExaminer, ResolvedPortalInvitation
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
    if inv.status == ExaminerInvitationStatus.ACCEPTED and inv.examiner_id is not None:
        summary["marking_cohorts"] = await _marking_cohorts_for_examiner(
            session,
            examination_id=int(inv.examination_id),
            subject_id=int(inv.subject_id),
            examiner_id=inv.examiner_id,
        )
    return summary


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
    return {
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
        "coordination_date": None,
        "responded_at": None,
        "can_respond": False,
        "examiner_id": examiner.id,
        "portal_mode": "roster",
        "roster_source": examiner.roster_source.value,
        "marking_cohorts": marking_cohorts,
    }


def invitation_is_publicly_accessible(resolved: ResolvedPortalInvitation) -> bool:
    return _is_publicly_accessible(resolved.invitation)
