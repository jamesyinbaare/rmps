"""Subject officer assignment scope checks."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Examination, Subject, SubjectOfficerAssignment, User, UserRole


async def load_assigned_subject_ids(
    session: AsyncSession,
    *,
    user_id: UUID,
    examination_id: int,
) -> set[int]:
    stmt = select(SubjectOfficerAssignment.subject_id).where(
        SubjectOfficerAssignment.user_id == user_id,
        SubjectOfficerAssignment.examination_id == examination_id,
    )
    rows = (await session.execute(stmt)).scalars().all()
    return set(rows)


def is_unrestricted_examiner_manager(user: User) -> bool:
    return user.role in {UserRole.SUPER_ADMIN, UserRole.TEST_ADMIN_OFFICER}


def can_manage_default_cohort(user: User) -> bool:
    return is_unrestricted_examiner_manager(user)


def assert_unrestricted_examiner_manager(user: User) -> None:
    if not is_unrestricted_examiner_manager(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Test Admin and Super Admin can manage examiners and cohorts.",
        )


async def effective_subject_scope(
    session: AsyncSession,
    user: User,
    examination_id: int,
) -> set[int] | None:
    """Return assigned subject ids for subject officers; None for unrestricted admins."""
    if is_unrestricted_examiner_manager(user):
        return None
    if user.role != UserRole.SUBJECT_OFFICER:
        return set()
    return await load_assigned_subject_ids(session, user_id=user.id, examination_id=examination_id)


async def assert_subject_officer_examination_access(
    session: AsyncSession,
    user: User,
    examination_id: int,
) -> set[int]:
    if is_unrestricted_examiner_manager(user):
        return set()
    if user.role != UserRole.SUBJECT_OFFICER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    subject_ids = await load_assigned_subject_ids(session, user_id=user.id, examination_id=examination_id)
    if not subject_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No subject assignment for this examination",
        )
    return subject_ids


async def assert_subject_officer_access(
    session: AsyncSession,
    user: User,
    examination_id: int,
    subject_id: int,
) -> None:
    if is_unrestricted_examiner_manager(user):
        return
    if user.role != UserRole.SUBJECT_OFFICER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    subject_ids = await load_assigned_subject_ids(session, user_id=user.id, examination_id=examination_id)
    if subject_id not in subject_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not assigned to this subject",
        )


async def assert_examiner_in_subject_scope(
    session: AsyncSession,
    user: User,
    examination_id: int,
    subject_ids: list[int],
) -> None:
    for sid in subject_ids:
        await assert_subject_officer_access(session, user, examination_id, sid)


async def load_subject_officer_multi_exam_scope(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> tuple[list[int], dict[int, set[int]]]:
    """Return examination ids and per-exam subject ids for a subject officer."""
    stmt = select(SubjectOfficerAssignment).where(SubjectOfficerAssignment.user_id == user_id)
    rows = list((await session.execute(stmt)).scalars().all())
    by_exam: dict[int, set[int]] = {}
    for row in rows:
        by_exam.setdefault(int(row.examination_id), set()).add(int(row.subject_id))
    return list(by_exam.keys()), by_exam


async def load_subject_officer_assignments_for_user(
    session: AsyncSession,
    *,
    user_id: UUID,
    examination_id: int | None = None,
) -> list[tuple[SubjectOfficerAssignment, Subject]]:
    stmt = (
        select(SubjectOfficerAssignment, Subject)
        .join(Subject, Subject.id == SubjectOfficerAssignment.subject_id)
        .where(SubjectOfficerAssignment.user_id == user_id)
        .order_by(SubjectOfficerAssignment.examination_id, Subject.code)
    )
    if examination_id is not None:
        stmt = stmt.where(SubjectOfficerAssignment.examination_id == examination_id)
    return list((await session.execute(stmt)).all())


async def load_subject_officer_assignment_rows(
    session: AsyncSession,
    *,
    user_id: UUID,
) -> list[SubjectOfficerAssignment]:
    stmt = (
        select(SubjectOfficerAssignment)
        .where(SubjectOfficerAssignment.user_id == user_id)
        .order_by(SubjectOfficerAssignment.examination_id, SubjectOfficerAssignment.subject_id)
    )
    return list((await session.execute(stmt)).scalars().all())


async def resolve_subject_officer_workspace_label(
    session: AsyncSession,
    *,
    assignment_id: UUID,
    user_id: UUID,
) -> str | None:
    """Human-readable workspace label for JWT assignment claim."""
    assignment = await session.get(SubjectOfficerAssignment, assignment_id)
    if assignment is None or assignment.user_id != user_id:
        return None
    exam = await session.get(Examination, assignment.examination_id)
    subject = await session.get(Subject, assignment.subject_id)
    if exam is None or subject is None:
        return None
    exam_label = f"{exam.exam_type} {exam.year}"
    subject_code = (subject.original_code or subject.code or "").strip()
    subject_name = subject.name.strip()
    subject_label = f"{subject_code} — {subject_name}" if subject_code else subject_name
    return f"{exam_label} · {subject_label}"
