"""Worked-scripts no_scripts (nil return) helpers."""

from datetime import datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers.script_control import (
    _detect_no_scripts_from_envelopes,
    _packing_to_response,
    _positive_envelope_counts_present,
    _series_slot_verified,
)
from app.schemas.script_control import ScriptEnvelopeItem, ScriptSeriesUpsertRequest


def test_detect_no_scripts_from_envelope1_zero() -> None:
    assert _detect_no_scripts_from_envelopes([ScriptEnvelopeItem(envelope_number=1, booklet_count=0)])
    assert not _detect_no_scripts_from_envelopes([])
    assert not _detect_no_scripts_from_envelopes([ScriptEnvelopeItem(envelope_number=1, booklet_count=5)])


def test_detect_no_scripts_rejects_envelope1_zero_with_envelope2() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _detect_no_scripts_from_envelopes(
            [
                ScriptEnvelopeItem(envelope_number=1, booklet_count=0),
                ScriptEnvelopeItem(envelope_number=2, booklet_count=0),
            ]
        )
    assert exc_info.value.status_code == 400
    assert "envelope 1 is zero" in exc_info.value.detail.lower()


def test_positive_envelope_counts_present() -> None:
    assert not _positive_envelope_counts_present([])
    assert not _positive_envelope_counts_present([ScriptEnvelopeItem(envelope_number=1, booklet_count=0)])
    assert _positive_envelope_counts_present([ScriptEnvelopeItem(envelope_number=1, booklet_count=3)])


def test_packing_to_response_no_scripts() -> None:
    ps = MagicMock()
    ps.id = uuid4()
    ps.no_scripts = True
    ps.envelopes = []
    resp = _packing_to_response(ps)
    assert resp.no_scripts is True
    assert resp.verified is True
    assert resp.envelopes == []


def test_packing_to_response_with_envelopes() -> None:
    env = MagicMock()
    env.envelope_number = 1
    env.booklet_count = 10
    env.verified_at = datetime.utcnow()
    ps = MagicMock()
    ps.id = uuid4()
    ps.no_scripts = False
    ps.envelopes = [env]
    resp = _packing_to_response(ps)
    assert resp.no_scripts is False
    assert resp.verified is True
    assert len(resp.envelopes) == 1


def test_series_slot_verified_no_scripts() -> None:
    ps = MagicMock()
    ps.no_scripts = True
    ps.envelopes = []
    assert _series_slot_verified(ps) is True


def test_series_slot_verified_empty_envelopes() -> None:
    ps = MagicMock()
    ps.no_scripts = False
    ps.envelopes = []
    assert _series_slot_verified(ps) is False


def test_script_series_upsert_request_accepts_no_scripts() -> None:
    body = ScriptSeriesUpsertRequest(
        subject_id=1,
        paper_number=1,
        series_number=1,
        no_scripts=True,
        envelopes=[],
    )
    assert body.no_scripts is True


@pytest.mark.asyncio
async def test_irregular_upsert_rejects_no_scripts() -> None:
    from app.routers.script_control import upsert_my_school_irregular_script_series

    body = ScriptSeriesUpsertRequest(
        subject_id=1,
        paper_number=1,
        series_number=1,
        no_scripts=True,
        envelopes=[],
    )
    with pytest.raises(HTTPException) as exc_info:
        await upsert_my_school_irregular_script_series(
            exam_id=1,
            body=body,
            session=MagicMock(),
            user=MagicMock(),
            jwt_posting_id=None,
            school_id=uuid4(),
        )
    assert exc_info.value.status_code == 400
    assert "regular worked scripts only" in exc_info.value.detail.lower()
