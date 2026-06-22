"""Tests for examiner background survey service."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import Examiner, ExaminerBackgroundOccupationType
from app.services.examiner_background_survey import (
    examiner_has_background_survey,
    get_survey_by_examiner_id,
    upsert_background_survey_for_examiner,
)


def _examiner(**kwargs: object) -> MagicMock:
    examiner = MagicMock(spec=Examiner)
    examiner.background_occupation_type = None
    examiner.background_institution_name = None
    examiner.background_teaching_subject = None
    examiner.background_industry = None
    examiner.background_specialization = None
    examiner.updated_at = None
    for key, value in kwargs.items():
        setattr(examiner, key, value)
    return examiner


def test_examiner_has_background_survey_teacher() -> None:
    examiner = _examiner(
        background_occupation_type=ExaminerBackgroundOccupationType.TEACHER.value,
        background_institution_name="Accra Academy",
        background_teaching_subject="Mathematics",
    )
    assert examiner_has_background_survey(examiner) is True


def test_examiner_has_background_survey_other() -> None:
    examiner = _examiner(
        background_occupation_type=ExaminerBackgroundOccupationType.OTHER.value,
        background_industry="Banking",
        background_specialization="Risk analysis",
    )
    assert examiner_has_background_survey(examiner) is True


@pytest.mark.asyncio
async def test_upsert_background_survey_teacher_clears_other_branch() -> None:
    examiner_id = uuid4()
    examiner = _examiner()
    session = AsyncMock()
    session.get = AsyncMock(return_value=examiner)

    result = await upsert_background_survey_for_examiner(
        session,
        examiner_id=examiner_id,
        occupation_type="teacher",
        institution_name="Kumasi High",
        teaching_subject="English",
        industry="Ignored",
        specialization="Ignored",
    )

    assert result is examiner
    assert examiner.background_occupation_type == "teacher"
    assert examiner.background_institution_name == "Kumasi High"
    assert examiner.background_teaching_subject == "English"
    assert examiner.background_industry is None
    assert examiner.background_specialization is None


@pytest.mark.asyncio
async def test_upsert_background_survey_other_clears_teacher_branch() -> None:
    examiner_id = uuid4()
    examiner = _examiner()
    session = AsyncMock()
    session.get = AsyncMock(return_value=examiner)

    await upsert_background_survey_for_examiner(
        session,
        examiner_id=examiner_id,
        occupation_type="other",
        institution_name="Ignored",
        teaching_subject="Ignored",
        industry="Healthcare",
        specialization="Nursing education",
    )

    assert examiner.background_occupation_type == "other"
    assert examiner.background_industry == "Healthcare"
    assert examiner.background_specialization == "Nursing education"
    assert examiner.background_institution_name is None
    assert examiner.background_teaching_subject is None


@pytest.mark.asyncio
async def test_upsert_background_survey_teacher_requires_fields() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=_examiner())

    with pytest.raises(ValueError, match="Institution name"):
        await upsert_background_survey_for_examiner(
            session,
            examiner_id=uuid4(),
            occupation_type="teacher",
            institution_name="",
            teaching_subject="Math",
            industry=None,
            specialization=None,
        )


@pytest.mark.asyncio
async def test_get_survey_by_examiner_id_returns_none_when_incomplete() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=_examiner())

    result = await get_survey_by_examiner_id(session, uuid4())
    assert result is None
