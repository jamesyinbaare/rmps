"""Enforce one subject per person globally; same subject allowed across examinations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Examiner, ExaminerInvitation, ExaminerInvitationStatus, Examination, Subject
from app.services.exam_official_export import examination_label

_LOCKING_INVITATION_STATUSES = frozenset(
    {
        ExaminerInvitationStatus.PENDING,
        ExaminerInvitationStatus.ACCEPTED,
        ExaminerInvitationStatus.DECLINED,
        ExaminerInvitationStatus.QUOTA_WAITLISTED,
    }
)


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


def _roster_subject_ids(examiner: Examiner) -> set[int]:
    return {int(s.subject_id) for s in examiner.subjects}


async def _iter_locking_invitations(
    session: AsyncSession,
    msisdn: str,
    *,
    allow_pending_invitation_id: UUID | None = None,
) -> list[ExaminerInvitation]:
    """Invitations that lock this phone, including accepted rows with cleared msisdn."""
    direct_stmt = select(ExaminerInvitation).where(ExaminerInvitation.msisdn == msisdn)
    if allow_pending_invitation_id is not None:
        direct_stmt = direct_stmt.where(ExaminerInvitation.id != allow_pending_invitation_id)

    linked_stmt = (
        select(ExaminerInvitation)
        .join(Examiner, ExaminerInvitation.examiner_id == Examiner.id)
        .where(
            Examiner.msisdn == msisdn,
            or_(
                ExaminerInvitation.msisdn.is_(None),
                ExaminerInvitation.msisdn != msisdn,
            ),
        )
    )
    if allow_pending_invitation_id is not None:
        linked_stmt = linked_stmt.where(ExaminerInvitation.id != allow_pending_invitation_id)

    direct = list((await session.execute(direct_stmt)).scalars().all())
    linked = list((await session.execute(linked_stmt)).scalars().all())
    seen: set[UUID] = set()
    out: list[ExaminerInvitation] = []
    for inv in [*direct, *linked]:
        if inv.id in seen:
            continue
        seen.add(inv.id)
        out.append(inv)
    return out


async def locked_subject_id_for_msisdn(
    session: AsyncSession,
    msisdn: str,
    *,
    exclude_examiner_id: UUID | None = None,
    allow_pending_invitation_id: UUID | None = None,
) -> int | None:
    """Return a locked subject_id for this phone, if any roster or invitation ties them to one."""
    normalized = msisdn.strip()
    if not normalized:
        return None

    roster_stmt = (
        select(Examiner)
        .where(Examiner.msisdn == normalized)
        .options(selectinload(Examiner.subjects))
    )
    if exclude_examiner_id is not None:
        roster_stmt = roster_stmt.where(Examiner.id != exclude_examiner_id)
    roster_rows = list((await session.execute(roster_stmt)).scalars().all())

    locked: set[int] = set()
    for ex in roster_rows:
        locked.update(_roster_subject_ids(ex))

    for inv in await _iter_locking_invitations(
        session,
        normalized,
        allow_pending_invitation_id=allow_pending_invitation_id,
    ):
        if inv.status not in _LOCKING_INVITATION_STATUSES:
            continue
        locked.add(int(inv.subject_id))

    if not locked:
        return None
    if len(locked) > 1:
        return next(iter(sorted(locked)))
    return next(iter(locked))


async def assert_examiner_subject_allowed(
    session: AsyncSession,
    *,
    examination_id: int,
    msisdn: str,
    subject_id: int,
    exclude_examiner_id: UUID | None = None,
    allow_pending_invitation_id: UUID | None = None,
) -> None:
    """Raise ValueError if this phone cannot be tied to subject_id."""
    normalized = msisdn.strip()
    if not normalized:
        raise ValueError("Phone number is required.")

    roster_stmt = (
        select(Examiner)
        .where(Examiner.msisdn == normalized)
        .options(selectinload(Examiner.subjects))
    )
    if exclude_examiner_id is not None:
        roster_stmt = roster_stmt.where(Examiner.id != exclude_examiner_id)
    roster_rows = list((await session.execute(roster_stmt)).scalars().all())

    for ex in roster_rows:
        locked_subject_ids = _roster_subject_ids(ex)
        if ex.examination_id == examination_id:
            if locked_subject_ids and subject_id not in locked_subject_ids:
                locked = await _subject_label(session, next(iter(locked_subject_ids)))
                requested = await _subject_label(session, subject_id)
                raise ValueError(
                    f"This person is on the roster for {locked} and cannot be added to {requested} "
                    "in this examination."
                )
            if locked_subject_ids and subject_id in locked_subject_ids:
                raise ValueError("This person is already on the examiner roster for this examination.")
            continue

        if locked_subject_ids and subject_id not in locked_subject_ids:
            locked = await _subject_label(session, next(iter(locked_subject_ids)))
            exam_label = await _examination_label(session, ex.examination_id)
            raise ValueError(
                f"This phone is already registered for {locked} in {exam_label}."
            )

    for inv in await _iter_locking_invitations(
        session,
        normalized,
        allow_pending_invitation_id=allow_pending_invitation_id,
    ):
        if inv.status not in _LOCKING_INVITATION_STATUSES:
            continue

        if inv.examination_id == examination_id:
            if inv.status == ExaminerInvitationStatus.PENDING and inv.subject_id == subject_id:
                raise ValueError(
                    "An invitation is already pending for this phone number in this examination."
                )
            if inv.subject_id != subject_id:
                locked = await _subject_label(session, int(inv.subject_id))
                requested = await _subject_label(session, subject_id)
                raise ValueError(
                    f"This person was invited for {locked} and cannot be added to {requested} "
                    "in this examination."
                )
            continue

        if int(inv.subject_id) != subject_id:
            locked = await _subject_label(session, int(inv.subject_id))
            exam_label = await _examination_label(session, int(inv.examination_id))
            raise ValueError(
                f"This phone was invited for {locked} in {exam_label} and cannot be used for "
                f"{await _subject_label(session, subject_id)}."
            )
