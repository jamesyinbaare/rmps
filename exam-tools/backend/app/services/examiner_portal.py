"""Examiner portal token generation, URL building, and token resolution."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Examiner, ExaminerInvitation, ExaminerSubject, Examination, Subject
from app.services.examiner_invitation import (
    generate_invitation_token,
    get_invitation_by_token,
    invitation_public_url,
)


def generate_portal_token() -> str:
    return generate_invitation_token()


def examiner_portal_url(token: str) -> str:
    return invitation_public_url(token)


@dataclass(frozen=True)
class ResolvedPortalInvitation:
    kind: str
    invitation: ExaminerInvitation


@dataclass(frozen=True)
class ResolvedPortalExaminer:
    kind: str
    examiner: Examiner
    examination: Examination
    subject: Subject


ResolvedPortalToken = ResolvedPortalInvitation | ResolvedPortalExaminer


def _examiner_load_options() -> list:
    return [
        selectinload(Examiner.examination),
        selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject),
    ]


async def resolve_portal_token(session: AsyncSession, token: str) -> ResolvedPortalToken | None:
    inv = await get_invitation_by_token(session, token)
    if inv is not None:
        return ResolvedPortalInvitation(kind="invitation", invitation=inv)

    stmt = select(Examiner).where(Examiner.portal_token == token).options(*_examiner_load_options())
    examiner = (await session.execute(stmt)).scalar_one_or_none()
    if examiner is None:
        return None

    exam = examiner.examination
    if exam is None or not examiner.subjects:
        return None
    subject = examiner.subjects[0].subject
    if subject is None:
        return None

    return ResolvedPortalExaminer(
        kind="roster",
        examiner=examiner,
        examination=exam,
        subject=subject,
    )


async def resolve_examiner_id_for_portal_token(session: AsyncSession, token: str) -> UUID:
    """Return examiner_id for accepted invitation or roster portal token."""
    resolved = await resolve_portal_token(session, token)
    if resolved is None:
        raise ValueError("Portal link not found.")

    if isinstance(resolved, ResolvedPortalInvitation):
        from app.services.examiner_bank_account import require_accepted_invitation_for_bank

        return require_accepted_invitation_for_bank(resolved.invitation)

    return resolved.examiner.id


async def resolve_examiner_id_for_letter_and_bank(session: AsyncSession, token: str) -> UUID:
    """Accepted/rostered examiner with appointment letter release gate."""
    examiner_id = await resolve_examiner_id_for_portal_token(session, token)
    from sqlalchemy.orm import selectinload

    from app.models import ExaminerSubject
    from app.services.examiner_portal_release import assert_may_access_letter_and_bank, load_examiner_for_portal

    examiner = await load_examiner_for_portal(session, examiner_id)
    if examiner is None:
        stmt = (
            select(Examiner)
            .where(Examiner.id == examiner_id)
            .options(selectinload(Examiner.subjects).selectinload(ExaminerSubject.subject))
        )
        examiner = (await session.execute(stmt)).scalar_one_or_none()
    if examiner is None:
        raise ValueError("Examiner record not found.")
    await assert_may_access_letter_and_bank(session, examiner)
    return examiner_id
