"""Business logic for irregular examination candidate registration."""

from __future__ import annotations

import json
from datetime import date, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExaminationCentre,
    IrregularExaminationCandidate,
    IrregularExaminationCandidateSubject,
    Programme,
    School,
    Subject,
    programme_subjects,
)
from app.schemas.irregular_candidates import (
    IrregularCandidateResponse,
    IrregularCandidateSubjectItem,
)
from app.services.examiner_location import GHANAPOST_GPS_MAX_LEN
from app.services.sms.phone import format_local_phone_username

MUTEX_SUBJECT_CODES = frozenset({"C702", "C705"})


def normalize_required_gender(raw: str | None) -> str:
    text = (raw or "").strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="gender is required",
        )
    aliases = {
        "male": "Male",
        "m": "Male",
        "female": "Female",
        "f": "Female",
    }
    normalized = aliases.get(text.lower())
    if normalized is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="gender must be Male or Female",
        )
    return normalized


def normalize_required_phone(raw: str, *, field_name: str = "phone") -> str:
    try:
        return format_local_phone_username(raw)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}: {e}",
        ) from e


def normalize_optional_phone(raw: str | None, *, field_name: str) -> str | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    return normalize_required_phone(text, field_name=field_name)


def normalize_optional_ghanapost_gps(raw: str | None) -> str | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    if len(text) > GHANAPOST_GPS_MAX_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GhanaPost GPS address must be {GHANAPOST_GPS_MAX_LEN} characters or fewer.",
        )
    return text


def parse_subject_ids_json(raw: str) -> list[int]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="subject_ids must be a JSON array of integers",
        ) from e
    if not isinstance(data, list) or not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one subject is required",
        )
    out: list[int] = []
    for item in data:
        try:
            out.append(int(item))
        except (TypeError, ValueError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="subject_ids must be a JSON array of integers",
            ) from e
    # preserve order, drop duplicates
    seen: set[int] = set()
    unique: list[int] = []
    for sid in out:
        if sid not in seen:
            seen.add(sid)
            unique.append(sid)
    return unique


def assert_c702_c705_mutex(subjects: list[Subject]) -> None:
    codes: set[str] = set()
    for s in subjects:
        for raw in (s.code, s.original_code):
            if raw:
                codes.add(str(raw).strip().upper())
    if "C702" in codes and "C705" in codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subjects C702 and C705 are mutually exclusive",
        )


async def load_programme_subjects_for_ids(
    session: AsyncSession,
    *,
    programme_id: int,
    subject_ids: list[int],
) -> list[Subject]:
    programme = await session.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Programme not found")

    stmt = (
        select(Subject)
        .join(programme_subjects, Subject.id == programme_subjects.c.subject_id)
        .where(
            programme_subjects.c.programme_id == programme_id,
            Subject.id.in_(subject_ids),
        )
    )
    result = await session.execute(stmt)
    found = list(result.scalars().all())
    found_ids = {s.id for s in found}
    missing = [sid for sid in subject_ids if sid not in found_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subjects not linked to this programme: {missing}",
        )
    # preserve request order
    by_id = {s.id: s for s in found}
    ordered = [by_id[sid] for sid in subject_ids]
    assert_c702_c705_mutex(ordered)
    return ordered


def candidate_to_response(
    row: IrregularExaminationCandidate,
    *,
    centre: ExaminationCentre,
    school: School,
    programme: Programme,
) -> IrregularCandidateResponse:
    return IrregularCandidateResponse(
        id=row.id,
        examination_id=row.examination_id,
        examination_centre_id=centre.id,
        examination_centre_code=str(centre.code),
        examination_centre_name=str(centre.name),
        school_id=school.id,
        school_code=str(school.code),
        school_name=str(school.name),
        programme_id=programme.id,
        programme_code=str(programme.code),
        programme_name=str(programme.name),
        first_name=row.first_name,
        last_name=row.last_name,
        other_name=row.other_name,
        gender=row.gender,
        date_of_birth=row.date_of_birth,
        phone_number=row.phone_number,
        guardian_name=row.guardian_name,
        guardian_phone_number=row.guardian_phone_number,
        ghanapost_gps_address=row.ghanapost_gps_address,
        subjects=[
            IrregularCandidateSubjectItem(
                subject_id=s.subject_id,
                subject_code=s.subject_code,
                subject_name=s.subject_name,
            )
            for s in (row.subject_selections or [])
        ],
        recorded_by_user_id=row.recorded_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def replace_subject_selections(
    row: IrregularExaminationCandidate,
    subjects: list[Subject],
) -> None:
    row.subject_selections.clear()
    for s in subjects:
        row.subject_selections.append(
            IrregularExaminationCandidateSubject(
                subject_id=s.id,
                subject_code=s.code,
                subject_name=s.name,
            )
        )


async def load_irregular_candidate(
    session: AsyncSession,
    *,
    examination_id: int,
    candidate_id: int,
    centre_id: UUID | None = None,
) -> IrregularExaminationCandidate:
    stmt = (
        select(IrregularExaminationCandidate)
        .options(
            selectinload(IrregularExaminationCandidate.subject_selections),
            selectinload(IrregularExaminationCandidate.examination_centre),
            selectinload(IrregularExaminationCandidate.school),
            selectinload(IrregularExaminationCandidate.programme),
        )
        .where(
            IrregularExaminationCandidate.id == candidate_id,
            IrregularExaminationCandidate.examination_id == examination_id,
        )
    )
    if centre_id is not None:
        stmt = stmt.where(IrregularExaminationCandidate.examination_centre_id == centre_id)
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Irregular candidate not found")
    return row


def parse_date_of_birth(raw: str) -> date:
    text = raw.strip()
    try:
        return date.fromisoformat(text)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="date_of_birth must be an ISO date (YYYY-MM-DD)",
        ) from e


def require_non_empty(raw: str | None, *, field_name: str) -> str:
    if raw is None or not str(raw).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} is required",
        )
    return str(raw).strip()


def touch_updated(row: IrregularExaminationCandidate) -> None:
    row.updated_at = datetime.utcnow()
