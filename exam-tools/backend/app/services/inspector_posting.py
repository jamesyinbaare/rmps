"""Inspector examination postings: workspace (centre + subject scope) per exam."""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExamInspectorSubjectScope,
    InspectorExamPosting,
    School,
    Subject,
    SubjectType,
    User,
    UserRole,
)
from app.services.timetable_service import center_scope_school_ids


def subject_matches_scope(scope: ExamInspectorSubjectScope, subject: Subject) -> bool:
    if scope == ExamInspectorSubjectScope.ALL:
        return True
    if scope == ExamInspectorSubjectScope.CORE:
        return subject.subject_type == SubjectType.CORE
    return subject.subject_type == SubjectType.ELECTIVE


def normalize_exam_inspector_subject_scope(
    scope: ExamInspectorSubjectScope | str,
) -> ExamInspectorSubjectScope:
    """ORM may return string values for ``native_enum=False`` columns; normalize for comparisons."""
    if isinstance(scope, ExamInspectorSubjectScope):
        return scope
    return ExamInspectorSubjectScope(scope)


def posting_pair_conflicts(
    scope_a: ExamInspectorSubjectScope | str,
    center_a: UUID,
    scope_b: ExamInspectorSubjectScope | str,
    center_b: UUID,
) -> bool:
    """True if two postings cannot coexist for the same examination and inspector."""
    if center_a != center_b:
        return False
    a = normalize_exam_inspector_subject_scope(scope_a)
    b = normalize_exam_inspector_subject_scope(scope_b)
    if a == ExamInspectorSubjectScope.ALL or b == ExamInspectorSubjectScope.ALL:
        return True
    if a == b:
        return True
    return False


async def load_postings_for_inspector_exam(
    session: AsyncSession,
    *,
    examination_id: int,
    inspector_user_id: UUID,
) -> list[InspectorExamPosting]:
    stmt = (
        select(InspectorExamPosting)
        .where(
            InspectorExamPosting.examination_id == examination_id,
            InspectorExamPosting.inspector_user_id == inspector_user_id,
        )
        .order_by(InspectorExamPosting.id)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def assert_centre_host_school(session: AsyncSession, center_id: UUID) -> School:
    sch = await session.get(School, center_id)
    if sch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination centre not found")
    if sch.writes_at_center_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="center_id must be an examination centre host school",
        )
    return sch


async def validate_new_posting_no_overlap(
    session: AsyncSession,
    *,
    examination_id: int,
    inspector_user_id: UUID,
    center_id: UUID,
    subject_scope: ExamInspectorSubjectScope,
    exclude_posting_id: UUID | None = None,
) -> None:
    existing = await load_postings_for_inspector_exam(
        session, examination_id=examination_id, inspector_user_id=inspector_user_id
    )
    new_scope = normalize_exam_inspector_subject_scope(subject_scope)
    for other in existing:
        if exclude_posting_id is not None and other.id == exclude_posting_id:
            continue
        if posting_pair_conflicts(
            new_scope, center_id, other.subject_scope, other.center_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Posting conflicts with an existing one at this examination centre "
                    "(ALL cannot be combined with other scopes at the same centre; "
                    "duplicate subject scope at the same centre is not allowed)"
                ),
            )


@dataclass(frozen=True)
class InspectorWorkspaceContext:
    center_host: School
    scope_ids: set[UUID]
    subject_scope: ExamInspectorSubjectScope
    posting: InspectorExamPosting | None


async def resolve_inspector_workspace(
    session: AsyncSession,
    *,
    examination_id: int,
    user: User,
    posting_id: UUID | None,
    jwt_posting_id: UUID | None = None,
) -> InspectorWorkspaceContext:
    """Pick centre scope and subject filter for an inspector API call.

    Query ``posting_id`` wins over the posting id embedded in the JWT from inspector login.
    When postings exist, an effective posting id is required unless exactly one posting exists.
    Inspectors without a posting for this examination cannot use the workspace APIs.
    """
    if user.role != UserRole.INSPECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inspector access only")

    effective_posting_id = posting_id
    if effective_posting_id is None and jwt_posting_id is not None:
        row = await session.get(InspectorExamPosting, jwt_posting_id)
        if (
            row is not None
            and row.inspector_user_id == user.id
            and row.examination_id == examination_id
        ):
            effective_posting_id = jwt_posting_id

    postings = await load_postings_for_inspector_exam(
        session, examination_id=examination_id, inspector_user_id=user.id
    )

    if not postings:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No inspector posting for this examination. You must be assigned a posting for this exam.",
        )

    chosen: InspectorExamPosting | None = None
    if effective_posting_id is None:
        if len(postings) == 1:
            chosen = postings[0]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="posting_id is required when you have more than one workspace for this examination",
            )
    else:
        for p in postings:
            if p.id == effective_posting_id:
                chosen = p
                break
        if chosen is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unknown or invalid posting_id for this examination",
            )

    host = await assert_centre_host_school(session, chosen.center_id)
    scope_ids = await center_scope_school_ids(session, host)
    return InspectorWorkspaceContext(
        center_host=host,
        scope_ids=scope_ids,
        subject_scope=chosen.subject_scope,
        posting=chosen,
    )


def filter_subject_rows_for_scope(
    rows: list[tuple[Subject, dict]],
    scope: ExamInspectorSubjectScope,
) -> list[tuple[Subject, dict]]:
    if scope == ExamInspectorSubjectScope.ALL:
        return rows
    if scope == ExamInspectorSubjectScope.CORE:
        return [(s, d) for s, d in rows if s.subject_type == SubjectType.CORE]
    return [(s, d) for s, d in rows if s.subject_type == SubjectType.ELECTIVE]


async def assert_subject_allowed_for_workspace(
    session: AsyncSession,
    ctx: InspectorWorkspaceContext,
    subject_id: int,
) -> Subject:
    sub = await session.get(Subject, subject_id)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    if not subject_matches_scope(ctx.subject_scope, sub):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This subject is outside your posting scope for the selected workspace",
        )
    return sub


async def union_scope_school_ids_for_inspector_postings(
    session: AsyncSession,
    postings: list[InspectorExamPosting],
) -> set[UUID]:
    out: set[UUID] = set()
    for p in postings:
        host = await assert_centre_host_school(session, p.center_id)
        out |= await center_scope_school_ids(session, host)
    return out


async def resolve_centre_host_school_by_code(session: AsyncSession, code: str) -> School:
    """Resolve an examination centre host school by its code. Raises ValueError if invalid."""
    cent_result = await session.execute(select(School).where(School.code == code))
    centre_host = cent_result.scalar_one_or_none()
    if centre_host is None:
        raise ValueError(f"No school with code {code!r}")
    if centre_host.writes_at_center_id is not None:
        raise ValueError(f"School {code!r} is not an examination centre host")
    return centre_host


def inspector_posting_targets_from_codes(
    core_code: str | None,
    elective_code: str | None,
) -> list[tuple[ExamInspectorSubjectScope, str]]:
    """Resolve core/elective host codes to (scope, code) pairs before DB resolution.

    Both set and equal → one ALL at that centre.
    Both set and different → CORE then ELECTIVE.
    Only one set → that scope at that centre.
    """
    core = core_code.strip() if core_code and core_code.strip() else None
    elective = elective_code.strip() if elective_code and elective_code.strip() else None

    if not core and not elective:
        raise ValueError("At least one of core or elective centre code is required")

    targets: list[tuple[ExamInspectorSubjectScope, str]] = []

    if core and elective:
        if core == elective:
            targets.append((ExamInspectorSubjectScope.ALL, core))
        else:
            targets.append((ExamInspectorSubjectScope.CORE, core))
            targets.append((ExamInspectorSubjectScope.ELECTIVE, elective))
    elif core:
        targets.append((ExamInspectorSubjectScope.CORE, core))
    else:
        targets.append((ExamInspectorSubjectScope.ELECTIVE, elective))

    return targets


async def find_inspector_posting_exact(
    session: AsyncSession,
    *,
    examination_id: int,
    inspector_user_id: UUID,
    center_id: UUID,
    subject_scope: ExamInspectorSubjectScope,
) -> InspectorExamPosting | None:
    """Same uniqueness as ``uq_inspector_postings_exam_center_inspector_scope`` (one row per centre+scope)."""
    stmt = select(InspectorExamPosting).where(
        InspectorExamPosting.examination_id == examination_id,
        InspectorExamPosting.inspector_user_id == inspector_user_id,
        InspectorExamPosting.center_id == center_id,
        InspectorExamPosting.subject_scope == subject_scope,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def create_inspector_postings_from_targets(
    session: AsyncSession,
    *,
    examination_id: int,
    inspector_user_id: UUID,
    targets: list[tuple[ExamInspectorSubjectScope, str]],
    created_by_user_id: UUID | None,
    notes: str | None = None,
) -> list[tuple[InspectorExamPosting, bool]]:
    """Create postings from (scope, centre host code) pairs.

    Returns (posting, inserted): ``inserted`` is False when centre+scope already existed.
    """
    if not targets:
        raise ValueError("At least one centre posting is required")

    created: list[tuple[InspectorExamPosting, bool]] = []
    for scope, code in targets:
        centre_host = await resolve_centre_host_school_by_code(session, code)
        existing = await find_inspector_posting_exact(
            session,
            examination_id=examination_id,
            inspector_user_id=inspector_user_id,
            center_id=centre_host.id,
            subject_scope=scope,
        )
        if existing is not None:
            created.append((existing, False))
            continue

        await validate_new_posting_no_overlap(
            session,
            examination_id=examination_id,
            inspector_user_id=inspector_user_id,
            center_id=centre_host.id,
            subject_scope=scope,
        )
        posting = InspectorExamPosting(
            examination_id=examination_id,
            inspector_user_id=inspector_user_id,
            center_id=centre_host.id,
            subject_scope=scope,
            notes=notes,
            created_by_user_id=created_by_user_id,
        )
        session.add(posting)
        await session.flush()
        created.append((posting, True))

    return created


async def create_inspector_postings_from_core_elective_codes(
    session: AsyncSession,
    *,
    examination_id: int,
    inspector_user_id: UUID,
    core_code: str | None,
    elective_code: str | None,
    created_by_user_id: UUID | None,
    notes: str | None = None,
) -> list[tuple[InspectorExamPosting, bool]]:
    """Create postings from optional core/elective centre host codes.

    - Both set and equal → one ALL posting at that centre.
    - Both set and different → CORE at first centre, ELECTIVE at second.
    - Only core → CORE; only elective → ELECTIVE.

    Requires at least one non-empty code. Raises ValueError for bad codes (same as bulk upload).

    Returns (posting, inserted): ``inserted`` is False when this centre+scope was already present (idempotent).
    """
    targets = inspector_posting_targets_from_codes(core_code, elective_code)
    return await create_inspector_postings_from_targets(
        session,
        examination_id=examination_id,
        inspector_user_id=inspector_user_id,
        targets=targets,
        created_by_user_id=created_by_user_id,
        notes=notes,
    )
