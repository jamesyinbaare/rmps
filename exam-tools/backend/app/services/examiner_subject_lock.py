"""Enforce one subject per person per examination and global phone uniqueness."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Examiner, ExaminerInvitation, ExaminerInvitationStatus, Examination, Subject
from app.services.exam_official_export import examination_label


async def _subject_label(session: AsyncSession, subject_id: int) -> str:
    subject = await session.get(Subject, subject_id)
    if subject is None:
        return f"subject #{subject_id}"
    return subject.name or subject.code


async def _examination_label(session: AsyncSession, examination_id: int) -> str:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        return f"examination #{examination_id}"
    return examination_label(exam)


async def assert_examiner_subject_allowed(
    session: AsyncSession,
    *,
    examination_id: int,
    msisdn: str,
    subject_id: int,
    exclude_examiner_id: UUID | None = None,
    allow_pending_invitation_id: UUID | None = None,
) -> None:
    """Raise ValueError if this phone cannot be tied to subject_id (global + per-examination rules)."""
    normalized = msisdn.strip()
    if not normalized:
        raise ValueError("Phone number is required.")

    global_roster_stmt = (
        select(Examiner)
        .where(Examiner.msisdn == normalized)
        .options(selectinload(Examiner.subjects))
    )
    if exclude_examiner_id is not None:
        global_roster_stmt = global_roster_stmt.where(Examiner.id != exclude_examiner_id)
    global_roster_rows = list((await session.execute(global_roster_stmt)).scalars().all())

    for ex in global_roster_rows:
        if ex.examination_id == examination_id:
            continue
        locked_subject_ids = {s.subject_id for s in ex.subjects}
        locked_subject = await _subject_label(
            session,
            next(iter(locked_subject_ids)) if locked_subject_ids else subject_id,
        )
        exam_label = await _examination_label(session, ex.examination_id)
        raise ValueError(
            f"This phone is already registered for {locked_subject} in {exam_label}."
        )

    global_inv_stmt = select(ExaminerInvitation).where(ExaminerInvitation.msisdn == normalized)
    if allow_pending_invitation_id is not None:
        global_inv_stmt = global_inv_stmt.where(ExaminerInvitation.id != allow_pending_invitation_id)
    global_invitations = list((await session.execute(global_inv_stmt)).scalars().all())

    for inv in global_invitations:
        if inv.examination_id == examination_id:
            continue
        locked = await _subject_label(session, inv.subject_id)
        exam_label = await _examination_label(session, inv.examination_id)
        raise ValueError(
            f"This phone was invited for {locked} in {exam_label} and cannot be used elsewhere."
        )

    inv_stmt = select(ExaminerInvitation).where(
        ExaminerInvitation.examination_id == examination_id,
        ExaminerInvitation.msisdn == normalized,
    )
    if allow_pending_invitation_id is not None:
        inv_stmt = inv_stmt.where(ExaminerInvitation.id != allow_pending_invitation_id)
    invitations = list((await session.execute(inv_stmt)).scalars().all())

    for inv in invitations:
        if inv.status == ExaminerInvitationStatus.PENDING:
            if inv.subject_id == subject_id:
                raise ValueError(
                    "An invitation is already pending for this phone number in this examination."
                )
            locked = await _subject_label(session, inv.subject_id)
            requested = await _subject_label(session, subject_id)
            raise ValueError(
                f"This person was invited for {locked} and cannot be added to {requested} "
                "in this examination."
            )
        if inv.subject_id != subject_id:
            locked = await _subject_label(session, inv.subject_id)
            requested = await _subject_label(session, subject_id)
            raise ValueError(
                f"This person was invited for {locked} and cannot be added to {requested} "
                "in this examination."
            )

    roster_stmt = (
        select(Examiner)
        .where(
            Examiner.examination_id == examination_id,
            Examiner.msisdn == normalized,
        )
        .options(selectinload(Examiner.subjects))
    )
    if exclude_examiner_id is not None:
        roster_stmt = roster_stmt.where(Examiner.id != exclude_examiner_id)
    roster_rows = list((await session.execute(roster_stmt)).scalars().all())

    for ex in roster_rows:
        subject_ids = {s.subject_id for s in ex.subjects}
        if subject_ids and subject_id not in subject_ids:
            locked = await _subject_label(session, next(iter(subject_ids)))
            requested = await _subject_label(session, subject_id)
            raise ValueError(
                f"This person is on the roster for {locked} and cannot be added to {requested} "
                "in this examination."
            )
        if subject_ids and subject_id in subject_ids:
            raise ValueError("This person is already on the examiner roster for this examination.")
