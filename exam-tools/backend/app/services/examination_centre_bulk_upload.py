"""Bulk upload examination centres and memberships from CSV/Excel."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CentreStructureMode,
    Examination,
    ExaminationCentre,
    ExaminationCentreMembership,
    ExaminationCentreMembershipScope,
    School,
)
from app.schemas.examination_centre import (
    ExaminationCentreBulkUploadError,
    ExaminationCentreBulkUploadResponse,
)
from app.services.school_bulk_upload import (
    SchoolUploadParseError,
    normalize_column_names,
    parse_school_code,
    read_upload_as_dataframe,
    validate_required_columns,
)

REQUIRED_COLUMNS = ("centre_code", "school_code")
DISALLOWED_COLUMNS = frozenset({"centre_name", "region", "zone", "name"})


class CentreBulkUploadParseError(SchoolUploadParseError):
    """Raised when the uploaded centres file cannot be read or validated."""


def validate_centre_bulk_columns(df: pd.DataFrame) -> None:
    if df.empty:
        raise CentreBulkUploadParseError("File has no data rows")
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise CentreBulkUploadParseError(f"Missing required columns: {', '.join(missing)}")
    extra = [c for c in df.columns if c in DISALLOWED_COLUMNS]
    if extra:
        raise CentreBulkUploadParseError(
            f"Remove unsupported columns (use school registry for centre metadata): {', '.join(sorted(extra))}"
        )


def normalize_subject_scope(
    scope: ExaminationCentreMembershipScope | str,
) -> ExaminationCentreMembershipScope:
    if isinstance(scope, ExaminationCentreMembershipScope):
        return scope
    return ExaminationCentreMembershipScope(scope)


def validate_upload_scope_for_exam(
    mode: CentreStructureMode,
    scope: ExaminationCentreMembershipScope,
) -> None:
    if mode == CentreStructureMode.UNIFIED and scope != ExaminationCentreMembershipScope.ALL:
        raise ValueError("UNIFIED examinations only accept subject_scope ALL")
    if mode == CentreStructureMode.SPLIT and scope == ExaminationCentreMembershipScope.ALL:
        raise ValueError("SPLIT examinations do not accept subject_scope ALL; use CORE or ELECTIVE")


def centre_fields_from_school(school: School) -> dict:
    """Snapshot host school attributes onto a new ExaminationCentre row."""
    return {
        "code": school.code,
        "name": school.name,
        "region": school.region,
        "zone": school.zone,
    }


@dataclass
class _BulkCounters:
    total_rows: int = 0
    centres_created: int = 0
    memberships_added: int = 0
    memberships_skipped: int = 0
    failed: int = 0
    errors: list[ExaminationCentreBulkUploadError] = field(default_factory=list)


def _membership_key(centre_id: UUID, school_id: UUID, scope: ExaminationCentreMembershipScope) -> tuple[UUID, UUID, str]:
    return (centre_id, school_id, scope.value)


async def _load_schools_by_code(session: AsyncSession, codes: set[str]) -> dict[str, School]:
    if not codes:
        return {}
    stmt = select(School).where(School.code.in_(codes))
    result = await session.execute(stmt)
    return {s.code: s for s in result.scalars().all()}


async def _load_centres_by_code(session: AsyncSession, examination_id: int) -> dict[str, ExaminationCentre]:
    stmt = select(ExaminationCentre).where(ExaminationCentre.examination_id == examination_id)
    result = await session.execute(stmt)
    return {c.code: c for c in result.scalars().all()}


async def _load_membership_index(
    session: AsyncSession,
    examination_id: int,
    scope: ExaminationCentreMembershipScope,
) -> dict[UUID, UUID]:
    """Map school_id -> examination_centre_id for this exam and scope."""
    stmt = select(ExaminationCentreMembership).where(
        ExaminationCentreMembership.examination_id == examination_id,
        ExaminationCentreMembership.subject_scope == scope,
    )
    result = await session.execute(stmt)
    return {m.school_id: m.examination_centre_id for m in result.scalars().all()}


async def _ensure_membership(
    session: AsyncSession,
    *,
    examination_id: int,
    centre: ExaminationCentre,
    school: School,
    scope: ExaminationCentreMembershipScope,
    school_to_centre: dict[UUID, UUID],
    existing_keys: set[tuple[UUID, UUID, str]],
    counters: _BulkCounters,
) -> None:
    existing_centre_id = school_to_centre.get(school.id)
    if existing_centre_id is not None:
        if existing_centre_id == centre.id:
            counters.memberships_skipped += 1
            return
        raise ValueError(
            f"School {school.code!r} is already assigned to another centre for {scope.value} scope"
        )

    key = _membership_key(centre.id, school.id, scope)
    if key in existing_keys:
        counters.memberships_skipped += 1
        school_to_centre[school.id] = centre.id
        return

    session.add(
        ExaminationCentreMembership(
            examination_id=examination_id,
            examination_centre_id=centre.id,
            school_id=school.id,
            subject_scope=scope,
        )
    )
    existing_keys.add(key)
    school_to_centre[school.id] = centre.id
    counters.memberships_added += 1


async def apply_centre_bulk_upload(
    session: AsyncSession,
    examination_id: int,
    subject_scope: ExaminationCentreMembershipScope | str,
    df: pd.DataFrame,
) -> ExaminationCentreBulkUploadResponse:
    scope = normalize_subject_scope(subject_scope)
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise ValueError("Examination not found")

    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)
    validate_upload_scope_for_exam(mode, scope)

    counters = _BulkCounters(total_rows=len(df))
    centres_by_code = await _load_centres_by_code(session, examination_id)
    school_to_centre = await _load_membership_index(session, examination_id, scope)
    existing_keys: set[tuple[UUID, UUID, str]] = set()

    mem_stmt = select(ExaminationCentreMembership).where(
        ExaminationCentreMembership.examination_id == examination_id,
        ExaminationCentreMembership.subject_scope == scope,
    )
    mem_result = await session.execute(mem_stmt)
    for m in mem_result.scalars().all():
        existing_keys.add(_membership_key(m.examination_centre_id, m.school_id, scope))

    all_codes: set[str] = set()
    parsed_rows: list[tuple[int, str, str]] = []
    for i, (_, row) in enumerate(df.iterrows()):
        row_number = i + 2
        try:
            centre_code = parse_school_code(row.get("centre_code"))
            school_code = parse_school_code(row.get("school_code"))
        except ValueError as exc:
            counters.failed += 1
            counters.errors.append(
                ExaminationCentreBulkUploadError(row_number=row_number, error_message=str(exc))
            )
            continue
        parsed_rows.append((row_number, centre_code, school_code))
        all_codes.add(centre_code)
        all_codes.add(school_code)

    schools_by_code = await _load_schools_by_code(session, all_codes)

    for row_number, centre_code, school_code in parsed_rows:
        host_school = schools_by_code.get(centre_code)
        if host_school is None:
            counters.failed += 1
            counters.errors.append(
                ExaminationCentreBulkUploadError(
                    row_number=row_number,
                    error_message=f"No school with code {centre_code!r} (centre_code must exist in registry)",
                )
            )
            continue

        member_school = schools_by_code.get(school_code)
        if member_school is None:
            counters.failed += 1
            counters.errors.append(
                ExaminationCentreBulkUploadError(
                    row_number=row_number,
                    error_message=f"No school with code {school_code!r}",
                )
            )
            continue

        centre = centres_by_code.get(centre_code)
        if centre is None:
            fields = centre_fields_from_school(host_school)
            centre = ExaminationCentre(
                examination_id=examination_id,
                code=fields["code"],
                name=fields["name"],
                region=fields["region"],
                zone=fields["zone"],
            )
            session.add(centre)
            await session.flush()
            centres_by_code[centre_code] = centre
            counters.centres_created += 1

            try:
                await _ensure_membership(
                    session,
                    examination_id=examination_id,
                    centre=centre,
                    school=host_school,
                    scope=scope,
                    school_to_centre=school_to_centre,
                    existing_keys=existing_keys,
                    counters=counters,
                )
            except ValueError as exc:
                counters.failed += 1
                counters.errors.append(
                    ExaminationCentreBulkUploadError(row_number=row_number, error_message=str(exc))
                )
                continue

        try:
            await _ensure_membership(
                session,
                examination_id=examination_id,
                centre=centre,
                school=member_school,
                scope=scope,
                school_to_centre=school_to_centre,
                existing_keys=existing_keys,
                counters=counters,
            )
        except ValueError as exc:
            counters.failed += 1
            counters.errors.append(
                ExaminationCentreBulkUploadError(row_number=row_number, error_message=str(exc))
            )

    await session.commit()

    return ExaminationCentreBulkUploadResponse(
        examination_id=examination_id,
        subject_scope=scope,
        total_rows=counters.total_rows,
        centres_created=counters.centres_created,
        memberships_added=counters.memberships_added,
        memberships_skipped=counters.memberships_skipped,
        failed=counters.failed,
        errors=counters.errors,
    )


def parse_centre_bulk_upload_file(content: bytes, filename: str) -> pd.DataFrame:
    df = read_upload_as_dataframe(content, filename)
    df = normalize_column_names(df)
    validate_centre_bulk_columns(df)
    return df
