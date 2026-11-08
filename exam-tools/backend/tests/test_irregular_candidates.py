"""Irregular candidate validation, feature gate, and centre-ops inclusion helpers."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.irregular_candidate_files import (
    IrregularCandidateUploadError,
    irregular_candidate_normalized_extension,
)
from app.services.irregular_candidates import (
    assert_c702_c705_mutex,
    load_irregular_candidate,
    normalize_optional_ghanapost_gps,
    normalize_required_gender,
    normalize_required_phone,
    parse_subject_ids_json,
)
from app.services.inspector_submission_settings import assert_irregular_candidates_enabled
from app.services.candidate_ops_queries import (
    candidate_counts_by_school,
    count_candidates_in_scope,
    get_candidate_schedule_codes_for_exam,
)


def test_irregular_candidate_image_extensions() -> None:
    assert irregular_candidate_normalized_extension("photo.JPG") == ".jpg"
    assert irregular_candidate_normalized_extension("voucher.webp") == ".webp"
    with pytest.raises(IrregularCandidateUploadError):
        irregular_candidate_normalized_extension("scan.pdf")


def test_parse_subject_ids_json() -> None:
    assert parse_subject_ids_json("[1, 2, 2, 3]") == [1, 2, 3]
    with pytest.raises(HTTPException) as ei:
        parse_subject_ids_json("[]")
    assert ei.value.status_code == 400
    with pytest.raises(HTTPException):
        parse_subject_ids_json("not-json")


def test_assert_c702_c705_mutex_rejects_both() -> None:
    s702 = MagicMock(code="C702", original_code="C702")
    s705 = MagicMock(code="C705", original_code=None)
    with pytest.raises(HTTPException) as ei:
        assert_c702_c705_mutex([s702, s705])
    assert ei.value.status_code == 400
    assert "mutually exclusive" in str(ei.value.detail)


def test_assert_c702_c705_mutex_allows_one() -> None:
    s701 = MagicMock(code="C701", original_code="C701")
    s702 = MagicMock(code="C702", original_code="C702")
    assert_c702_c705_mutex([s701, s702])


def test_assert_c702_c705_mutex_matches_original_code() -> None:
    s702 = MagicMock(code="X702", original_code="C702")
    s705 = MagicMock(code="X705", original_code="C705")
    with pytest.raises(HTTPException):
        assert_c702_c705_mutex([s702, s705])


def test_generate_irregular_candidates_export_empty() -> None:
    from app.services.irregular_candidate_export import generate_irregular_candidates_export

    payload = generate_irregular_candidates_export([])
    assert payload[:2] == b"PK"


def test_normalize_required_gender() -> None:
    assert normalize_required_gender("Male") == "Male"
    assert normalize_required_gender("female") == "Female"
    assert normalize_required_gender("M") == "Male"
    with pytest.raises(HTTPException) as missing:
        normalize_required_gender("")
    assert missing.value.status_code == 400
    with pytest.raises(HTTPException) as invalid:
        normalize_required_gender("Other")
    assert invalid.value.status_code == 400


def test_normalize_required_phone() -> None:
    assert normalize_required_phone("0551234567") == "0551234567"
    assert normalize_required_phone("233551234567") == "0551234567"
    with pytest.raises(HTTPException):
        normalize_required_phone("123")


def test_normalize_optional_ghanapost_gps() -> None:
    assert normalize_optional_ghanapost_gps(None) is None
    assert normalize_optional_ghanapost_gps("  ") is None
    assert normalize_optional_ghanapost_gps(" GA-123-4567 ") == "GA-123-4567"
    with pytest.raises(HTTPException):
        normalize_optional_ghanapost_gps("x" * 51)


@pytest.mark.asyncio
async def test_assert_irregular_candidates_enabled_blocks_when_off() -> None:
    from unittest.mock import patch

    settings = MagicMock(irregular_candidates_enabled=False)
    session = AsyncMock()
    with patch(
        "app.services.inspector_submission_settings.get_or_create_submission_settings",
        new_callable=AsyncMock,
        return_value=settings,
    ):
        with pytest.raises(HTTPException) as ei:
            await assert_irregular_candidates_enabled(session, 1)
        assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_load_irregular_candidate_scopes_by_centre_not_recorder() -> None:
    """Any inspector at the centre can load a candidate; access is centre-bound, not recorder-bound."""
    centre_id = uuid4()
    other_centre_id = uuid4()
    row = MagicMock()
    session = AsyncMock()

    class _ScalarResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    session.execute = AsyncMock(return_value=_ScalarResult(row))
    found = await load_irregular_candidate(
        session,
        examination_id=1,
        candidate_id=9,
        centre_id=centre_id,
    )
    assert found is row

    session.execute = AsyncMock(return_value=_ScalarResult(None))
    with pytest.raises(HTTPException) as ei:
        await load_irregular_candidate(
            session,
            examination_id=1,
            candidate_id=9,
            centre_id=other_centre_id,
        )
    assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_irregular_candidates_enabled_allows_when_on() -> None:
    from unittest.mock import patch

    settings = MagicMock(irregular_candidates_enabled=True)
    session = AsyncMock()
    with patch(
        "app.services.inspector_submission_settings.get_or_create_submission_settings",
        new_callable=AsyncMock,
        return_value=settings,
    ):
        out = await assert_irregular_candidates_enabled(session, 1)
        assert out is settings


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalar_one(self):
        return self._rows[0] if not isinstance(self._rows[0], tuple) else self._rows[0][0]


@pytest.mark.asyncio
async def test_get_candidate_schedule_codes_unions_irregular() -> None:
    school_id = uuid4()
    session = AsyncMock()
    calls = {"n": 0}

    async def execute_by_call(_stmt):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Result([("C701",), ("C702",)])
        return _Result([("C705",), ("C702",)])

    session.execute = AsyncMock(side_effect=execute_by_call)
    codes = await get_candidate_schedule_codes_for_exam(session, 9, {school_id})
    assert codes == {"C701", "C702", "C705"}


@pytest.mark.asyncio
async def test_count_candidates_in_scope_sums_both_sources() -> None:
    school_id = uuid4()
    session = AsyncMock()
    calls = {"n": 0}

    async def execute_by_call(_stmt):
        calls["n"] += 1
        return _Result([10 if calls["n"] == 1 else 3])

    session.execute = AsyncMock(side_effect=execute_by_call)
    total = await count_candidates_in_scope(session, 1, {school_id})
    assert total == 13


@pytest.mark.asyncio
async def test_candidate_counts_by_school_merges() -> None:
    school_a = uuid4()
    school_b = uuid4()
    session = AsyncMock()
    calls = {"n": 0}

    async def execute_by_call(_stmt):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Result([(school_a, 5), (school_b, 2)])
        return _Result([(school_a, 1)])

    session.execute = AsyncMock(side_effect=execute_by_call)
    counts = await candidate_counts_by_school(session, 1, {school_a, school_b})
    assert counts[school_a] == 6
    assert counts[school_b] == 2
