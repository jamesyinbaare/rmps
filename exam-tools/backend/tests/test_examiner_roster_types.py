"""Tests for examiner roster type and spreadsheet parsing."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pandas as pd
import pytest

from app.models import ExaminerInvitationStatus, ExaminerType, Region, Subject
from app.services.examiner_roster import (
    parse_examiner_type_cell,
    parse_gender_cell,
    subject_id_for_code,
)


def test_parse_examiner_type_assistant_chief_aliases() -> None:
    assert parse_examiner_type_cell("ace") == ExaminerType.ASSISTANT_CHIEF
    assert parse_examiner_type_cell("assistant_chief_examiner") == ExaminerType.ASSISTANT_CHIEF
    assert parse_examiner_type_cell("Assistant Chief") == ExaminerType.ASSISTANT_CHIEF


def test_parse_examiner_type_uppercase_abbreviations() -> None:
    assert parse_examiner_type_cell("CE") == ExaminerType.CHIEF
    assert parse_examiner_type_cell("AE") == ExaminerType.ASSISTANT
    assert parse_examiner_type_cell("ACE") == ExaminerType.ASSISTANT_CHIEF
    assert parse_examiner_type_cell("TL") == ExaminerType.TEAM_LEADER


def test_parse_gender_cell_valid_and_blank() -> None:
    assert parse_gender_cell(None) is None
    assert parse_gender_cell("") is None
    assert parse_gender_cell("  ") is None
    assert parse_gender_cell("Male") == "Male"
    assert parse_gender_cell("female") == "Female"
    assert parse_gender_cell("M") == "Male"
    assert parse_gender_cell("f") == "Female"


def test_parse_gender_cell_invalid() -> None:
    with pytest.raises(ValueError, match="Unknown gender"):
        parse_gender_cell("Other")


def _make_result(rows: list[Subject]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


@pytest.mark.asyncio
async def test_subject_id_for_code_resolves_original_code() -> None:
    subject = MagicMock(spec=Subject)
    subject.id = 42
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            _make_result([subject]),
            _make_result([]),
        ]
    )
    assert await subject_id_for_code(session, "MATH301") == 42


@pytest.mark.asyncio
async def test_subject_id_for_code_falls_back_to_internal_code() -> None:
    subject = MagicMock(spec=Subject)
    subject.id = 7
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            _make_result([]),
            _make_result([subject]),
        ]
    )
    assert await subject_id_for_code(session, "301") == 7


@pytest.mark.asyncio
async def test_subject_id_for_code_case_insensitive_single_match() -> None:
    subject = MagicMock(spec=Subject)
    subject.id = 3
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            _make_result([]),
            _make_result([]),
            _make_result([subject]),
            _make_result([]),
        ]
    )
    assert await subject_id_for_code(session, "math301") == 3


@pytest.mark.asyncio
async def test_subject_id_for_code_ambiguous() -> None:
    s1 = MagicMock(spec=Subject)
    s1.id = 1
    s2 = MagicMock(spec=Subject)
    s2.id = 2
    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            _make_result([s1]),
            _make_result([s2]),
        ]
    )
    with pytest.raises(ValueError, match="Ambiguous subject code"):
        await subject_id_for_code(session, "301")


@pytest.mark.asyncio
async def test_subject_id_for_code_unknown() -> None:
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=[_make_result([]) for _ in range(4)])
    with pytest.raises(ValueError, match="Unknown subject code"):
        await subject_id_for_code(session, "NOPE")


@pytest.mark.asyncio
async def test_dataframe_row_to_examiner_fields_includes_gender() -> None:
    from app.services.examiner_roster import dataframe_row_to_examiner_fields

    session = AsyncMock()
    row = pd.Series(
        {
            "name": "Jane",
            "subject_code": "MATH301",
            "examiner_type": "AE",
            "region": "Greater Accra",
            "phone_number": "0551234567",
            "gender": "Female",
        }
    )
    with patch(
        "app.services.examiner_roster.subject_id_for_code",
        new_callable=AsyncMock,
        return_value=10,
    ):
        fields = await dataframe_row_to_examiner_fields(session, row)
    assert fields["gender"] == "Female"
    assert fields["examiner_type"] == ExaminerType.ASSISTANT


@pytest.mark.asyncio
async def test_accept_invitation_copies_gender_to_examiner() -> None:
    from app.models import ExaminerInvitation
    from app.services.examiner_invitation import accept_examiner_invitation

    session = AsyncMock()
    inv = MagicMock(spec=ExaminerInvitation)
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime.utcnow() + timedelta(days=3)
    inv.token_expires_at = datetime.utcnow() - timedelta(days=1)
    inv.examination_id = 1
    inv.msisdn = "233551234567"
    inv.name = "Jane"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.GREATER_ACCRA
    inv.phone_number = "0551234567"
    inv.subject_id = 10
    inv.gender = "Female"
    inv.examiner_id = None

    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=existing_result)
    session.add = MagicMock()

    async def _flush() -> None:
        for call in session.add.call_args_list:
            obj = call.args[0]
            if not hasattr(obj, "id") or obj.id is None:
                obj.id = uuid4()

    session.flush = AsyncMock(side_effect=_flush)

    with (
        patch(
            "app.services.examiner_invitation.would_exceed_quota",
            new_callable=AsyncMock,
            return_value=MagicMock(exceeded=False),
        ),
        patch(
            "app.services.examiner_invitation.assign_reference_code_to_examiner",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.examiner_invitation.sync_default_cohort_members",
            new_callable=AsyncMock,
        ),
        patch(
            "app.services.examiner_invitation.sync_examiner_subjects",
            new_callable=AsyncMock,
        ),
    ):
        result = await accept_examiner_invitation(session, inv)

    assert result.outcome == "accepted"
    assert result.examiner is not None
    assert result.examiner.gender == "Female"
