"""Background survey (teacher/other) for accepted examiners."""

from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Examiner, ExaminerBackgroundOccupationType


def _normalize_text(raw: str | None, *, field_label: str, max_len: int = 255) -> str:
    text = (raw or "").strip()
    if not text:
        raise ValueError(f"{field_label} is required.")
    if len(text) > max_len:
        raise ValueError(f"{field_label} must be {max_len} characters or fewer.")
    return text


def _parse_occupation_type(raw: str) -> ExaminerBackgroundOccupationType:
    try:
        return ExaminerBackgroundOccupationType(str(raw).strip().lower())
    except ValueError as exc:
        raise ValueError("Occupation type must be teacher or other.") from exc


def examiner_has_background_survey(examiner: Examiner) -> bool:
    occupation = cast(str | None, examiner.background_occupation_type)
    if not occupation or not occupation.strip():
        return False
    try:
        occ = _parse_occupation_type(occupation)
    except ValueError:
        return False
    if occ == ExaminerBackgroundOccupationType.TEACHER:
        institution = cast(str | None, examiner.background_institution_name)
        subject = cast(str | None, examiner.background_teaching_subject)
        return bool(institution and institution.strip() and subject and subject.strip())
    industry = cast(str | None, examiner.background_industry)
    specialization = cast(str | None, examiner.background_specialization)
    return bool(industry and industry.strip() and specialization and specialization.strip())


def survey_to_dict(examiner: Examiner) -> dict:
    occupation = _parse_occupation_type(cast(str, examiner.background_occupation_type))
    return {
        "occupation_type": occupation.value,
        "institution_name": cast(str | None, examiner.background_institution_name),
        "teaching_subject": cast(str | None, examiner.background_teaching_subject),
        "industry": cast(str | None, examiner.background_industry),
        "specialization": cast(str | None, examiner.background_specialization),
        "updated_at": cast(datetime, examiner.updated_at),
    }


async def get_survey_by_examiner_id(
    session: AsyncSession,
    examiner_id: UUID,
) -> Examiner | None:
    examiner = await session.get(Examiner, examiner_id)
    if examiner is None or not examiner_has_background_survey(examiner):
        return None
    return examiner


async def upsert_background_survey_for_examiner(
    session: AsyncSession,
    *,
    examiner_id: UUID,
    occupation_type: str,
    institution_name: str | None,
    teaching_subject: str | None,
    industry: str | None,
    specialization: str | None,
) -> Examiner:
    examiner = await session.get(Examiner, examiner_id)
    if examiner is None:
        raise ValueError("Examiner not found.")

    occ = _parse_occupation_type(occupation_type)
    now = datetime.utcnow()

    if occ == ExaminerBackgroundOccupationType.TEACHER:
        examiner.background_occupation_type = occ.value
        examiner.background_institution_name = _normalize_text(
            institution_name,
            field_label="Institution name",
        )
        examiner.background_teaching_subject = _normalize_text(
            teaching_subject,
            field_label="Teaching subject",
        )
        examiner.background_industry = None
        examiner.background_specialization = None
    else:
        examiner.background_occupation_type = occ.value
        examiner.background_industry = _normalize_text(industry, field_label="Industry")
        examiner.background_specialization = _normalize_text(
            specialization,
            field_label="Specialization",
        )
        examiner.background_institution_name = None
        examiner.background_teaching_subject = None

    examiner.updated_at = now
    await session.flush()
    await session.refresh(examiner)
    return examiner
