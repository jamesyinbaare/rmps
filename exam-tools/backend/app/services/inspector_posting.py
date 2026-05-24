"""Inspector examination postings: workspace (centre + subject scope) per exam."""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExamInspectorSubjectScope,
    ExaminationCentre,
    InspectorExamPosting,
    School,
    Subject,
    SubjectType,
    User,
    UserRole,
)
from app.services.centre_resolution import (
    centre_scope_school_ids_for_inspector_scope,
    get_examination_centre_or_404,
    schools_in_centre_scope_ordered,
)


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
    centre_a: UUID,
    scope_b: ExamInspectorSubjectScope | str,
    centre_b: UUID,
) -> bool:
    """True if two postings cannot coexist for the same examination and inspector."""
    if centre_a != centre_b:
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


async def assert_examination_centre(
    session: AsyncSession,
    examination_id: int,
    examination_centre_id: UUID,
) -> ExaminationCentre:
    return await get_examination_centre_or_404(session, examination_id, examination_centre_id)


async def validate_new_posting_no_overlap(
    session: AsyncSession,
    *,
    examination_id: int,
    inspector_user_id: UUID,
    examination_centre_id: UUID,
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
            new_scope,
            examination_centre_id,
            other.subject_scope,
            other.examination_centre_id,
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
    examination_centre: ExaminationCentre
    scope_ids: set[UUID]
    subject_scope: ExamInspectorSubjectScope
    posting: InspectorExamPosting | None

    @property
    def center_host(self) -> None:
        """Removed; use examination_centre. Kept only to surface AttributeError during migration."""
        raise AttributeError("Use examination_centre instead of center_host")


async def representative_school_for_centre(
    session: AsyncSession,
    centre: ExaminationCentre,
) -> School | None:
    ordered = await schools_in_centre_scope_ordered(session, centre)
    if ordered:
        return ordered[0]
    stmt = select(School).where(School.code == centre.code)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def resolve_inspector_workspace(
    session: AsyncSession,
    *,
    examination_id: int,
    user: User,
    posting_id: UUID | None,
    jwt_posting_id: UUID | None = None,
) -> InspectorWorkspaceContext:
    """Pick centre scope and subject filter for an inspector API call."""
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

    centre = await assert_examination_centre(
        session, examination_id, chosen.examination_centre_id
    )
    scope_ids = await centre_scope_school_ids_for_inspector_scope(
        session, centre, chosen.subject_scope
    )
    return InspectorWorkspaceContext(
        examination_centre=centre,
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
        centre = await session.get(ExaminationCentre, p.examination_centre_id)
        if centre is None:
            continue
        out |= await centre_scope_school_ids_for_inspector_scope(
            session, centre, p.subject_scope
        )
    return out


async def resolve_examination_centre_by_code(
    session: AsyncSession,
    examination_id: int,
    code: str,
) -> ExaminationCentre:
    """Resolve an examination centre by code for this examination. Raises ValueError if invalid."""
    stmt = select(ExaminationCentre).where(
        ExaminationCentre.examination_id == examination_id,
        ExaminationCentre.code == code.strip(),
    )
    result = await session.execute(stmt)
    centre = result.scalar_one_or_none()
    if centre is None:
        raise ValueError(f"No examination centre with code {code!r} for this examination")
    return centre


# Backward-compatible alias
resolve_centre_host_school_by_code = resolve_examination_centre_by_code


def inspector_posting_targets_from_codes(
    core_code: str | None,
    elective_code: str | None,
) -> list[tuple[ExamInspectorSubjectScope, str]]:
    """Resolve core/elective centre codes to (scope, code) pairs before DB resolution."""
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
    examination_centre_id: UUID,
    subject_scope: ExamInspectorSubjectScope,
) -> InspectorExamPosting | None:
    stmt = select(InspectorExamPosting).where(
        InspectorExamPosting.examination_id == examination_id,
        InspectorExamPosting.inspector_user_id == inspector_user_id,
        InspectorExamPosting.examination_centre_id == examination_centre_id,
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
    if not targets:
        raise ValueError("At least one centre posting is required")

    created: list[tuple[InspectorExamPosting, bool]] = []
    for scope, code in targets:
        centre = await resolve_examination_centre_by_code(session, examination_id, code)
        existing = await find_inspector_posting_exact(
            session,
            examination_id=examination_id,
            inspector_user_id=inspector_user_id,
            examination_centre_id=centre.id,
            subject_scope=scope,
        )
        if existing is not None:
            created.append((existing, False))
            continue

        await validate_new_posting_no_overlap(
            session,
            examination_id=examination_id,
            inspector_user_id=inspector_user_id,
            examination_centre_id=centre.id,
            subject_scope=scope,
        )
        posting = InspectorExamPosting(
            examination_id=examination_id,
            inspector_user_id=inspector_user_id,
            examination_centre_id=centre.id,
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
    targets = inspector_posting_targets_from_codes(core_code, elective_code)
    return await create_inspector_postings_from_targets(
        session,
        examination_id=examination_id,
        inspector_user_id=inspector_user_id,
        targets=targets,
        created_by_user_id=created_by_user_id,
        notes=notes,
    )
