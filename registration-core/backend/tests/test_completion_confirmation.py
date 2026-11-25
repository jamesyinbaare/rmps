"""Tests for school registration completion confirmation (QR HMAC + lock)."""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import (
    ExamRegistrationPeriod,
    RegistrationExam,
    School,
    SchoolRegistrationCompletion,
    SchoolRegistrationCompletionStatus,
)
from app.services.completion_confirmation_service import (
    _render_declaration_pdf,
    assert_registration_editable,
    build_signed_qr_payload,
    compute_counts_digest,
    decode_qr_from_upload,
    verify_signed_qr_payload,
)
from fastapi import HTTPException


def test_hmac_qr_round_trip():
    payload = build_signed_qr_payload(
        exam_id=10,
        school_id=20,
        token="11111111-2222-3333-4444-555555555555",
        nonce="abcd1234",
        total=12,
        counts_digest="a" * 64,
    )
    body = verify_signed_qr_payload(payload)
    assert body["e"] == 10
    assert body["s"] == 20
    assert body["t"] == "11111111-2222-3333-4444-555555555555"
    assert body["tot"] == 12
    assert body["d"] == "a" * 64


def test_hmac_rejects_tampered_payload():
    payload = build_signed_qr_payload(
        exam_id=1,
        school_id=2,
        token="tok",
        nonce="n1",
        total=3,
        counts_digest="b" * 64,
    )
    body_b64, _sig = payload.split(".", 1)
    with pytest.raises(ValueError, match="signature"):
        verify_signed_qr_payload(f"{body_b64}.{'0' * 64}")


def test_counts_digest_stable_under_key_order():
    programmes_a = [
        {"programme_id": 2, "code": "B", "name": "Beta", "total": 1, "by_type": {"fee_paying": 1}},
        {"programme_id": 1, "code": "A", "name": "Alpha", "total": 2, "by_type": {"free_tvet": 2}},
    ]
    programmes_b = list(reversed(programmes_a))
    d1 = compute_counts_digest(3, {"referral": 0, "fee_paying": 1, "free_tvet": 2}, programmes_a)
    d2 = compute_counts_digest(3, {"free_tvet": 2, "fee_paying": 1, "referral": 0}, programmes_b)
    assert d1 == d2


@pytest.mark.asyncio
async def test_assert_registration_editable_blocks_when_confirmed():
    exam = MagicMock(spec=RegistrationExam)
    exam.id = 5
    exam.requires_completion_confirmation = True

    session = AsyncMock()
    with patch(
        "app.services.completion_confirmation_service.is_school_registration_confirmed",
        new=AsyncMock(return_value=True),
    ):
        with pytest.raises(HTTPException) as exc:
            await assert_registration_editable(session, exam, school_id=9)
        assert exc.value.status_code == 400
        assert "locked" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_assert_registration_editable_allows_when_flag_off():
    exam = MagicMock(spec=RegistrationExam)
    exam.id = 5
    exam.requires_completion_confirmation = False
    session = AsyncMock()
    await assert_registration_editable(session, exam, school_id=9)


@pytest.mark.asyncio
async def test_confirm_from_upload_happy_path_with_payload_override():
    from app.services import completion_confirmation_service as svc

    exam = MagicMock(spec=RegistrationExam)
    exam.id = 7
    exam.requires_completion_confirmation = True
    exam.exam_type = "Traditional"
    exam.exam_series = "May"
    exam.year = 2026

    school = MagicMock(spec=School)
    school.id = 3
    school.code = "SCH001"
    school.name = "Test School"
    school.principal_name = "Ada Head"
    school.principal_email = "head@example.com"
    school.principal_phone = "0244123456"

    token = str(uuid4())
    nonce = "deadbeef"
    by_type = {"fee_paying": 2, "free_tvet": 0, "referral": 0}
    by_programme = [
        {
            "programme_id": 1,
            "code": "P1",
            "name": "Prog",
            "total": 2,
            "by_type": {"fee_paying": 2},
        }
    ]
    digest = compute_counts_digest(2, by_type, by_programme)

    row = SchoolRegistrationCompletion(
        id=1,
        exam_id=7,
        school_id=3,
        status=SchoolRegistrationCompletionStatus.PENDING,
        confirmation_token=token,
        payload_nonce=nonce,
        total_candidates=2,
        counts_by_type=by_type,
        counts_by_programme=by_programme,
        counts_digest=digest,
        declaration_generated_at=datetime.utcnow(),
        generation_count=1,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    qr = build_signed_qr_payload(
        exam_id=7,
        school_id=3,
        token=token,
        nonce=nonce,
        total=2,
        counts_digest=digest,
    )

    live = MagicMock()
    live.total_candidates = 2
    live.counts_by_type = by_type
    live.counts_by_programme = [
        MagicMock(model_dump=lambda: by_programme[0])
    ]
    # ProgrammeCountBreakdown-like
    from app.schemas.completion import ProgrammeCountBreakdown, SchoolExamCounts

    live_counts = SchoolExamCounts(
        total_candidates=2,
        counts_by_type=by_type,
        counts_by_programme=[ProgrammeCountBreakdown(**by_programme[0])],
    )

    session = AsyncMock()
    storage = AsyncMock()
    storage.save = AsyncMock(return_value=("completion-declarations/3/7/x.pdf", "checksum"))

    status_response = MagicMock()
    status_response.is_confirmed = True

    notify_mock = AsyncMock()
    with (
        patch.object(svc, "is_school_eligible_for_exam", new=AsyncMock(return_value=True)),
        patch.object(svc, "_get_exam", new=AsyncMock(return_value=exam)),
        patch.object(svc, "is_registration_open_for_school", new=AsyncMock(return_value=True)),
        patch.object(svc, "_get_completion_row", new=AsyncMock(side_effect=[row, row])),
        patch.object(svc, "compute_school_exam_counts", new=AsyncMock(return_value=live_counts)),
        patch.object(svc, "get_storage_backend", return_value=storage),
        patch.object(svc, "notify_principal_of_confirmation", new=notify_mock),
        patch.object(svc, "get_completion_status", new=AsyncMock(return_value=status_response)),
    ):
        # Token lookup via session.execute
        token_result = MagicMock()
        token_result.scalar_one_or_none.return_value = row
        school_result = MagicMock()
        school_result.scalar_one.return_value = school

        async def execute_side_effect(stmt):
            # First execute is token lookup; second is school load after confirm
            text = str(stmt)
            if "confirmation_token" in text or "school_registration_completions" in text.lower():
                return token_result
            return school_result

        session.execute = AsyncMock(side_effect=execute_side_effect)

        result = await svc.confirm_from_upload(
            session,
            exam_id=7,
            school_id=3,
            user_id=uuid4(),
            file_content=b"fake-scan",
            filename="scan.png",
            mime_type="image/png",
            qr_payload_override=qr,
        )

    assert result is status_response
    assert row.status == SchoolRegistrationCompletionStatus.CONFIRMED
    storage.save.assert_awaited()
    notify_mock.assert_awaited()


@pytest.mark.asyncio
async def test_confirm_rejects_stale_counts():
    from app.services import completion_confirmation_service as svc
    from app.schemas.completion import ProgrammeCountBreakdown, SchoolExamCounts

    exam = MagicMock(spec=RegistrationExam)
    exam.id = 7
    exam.requires_completion_confirmation = True

    token = str(uuid4())
    nonce = "cafebabe"
    by_type = {"fee_paying": 1, "free_tvet": 0, "referral": 0}
    by_programme = [
        {
            "programme_id": 1,
            "code": "P1",
            "name": "Prog",
            "total": 1,
            "by_type": {"fee_paying": 1},
        }
    ]
    digest = compute_counts_digest(1, by_type, by_programme)
    row = SchoolRegistrationCompletion(
        id=1,
        exam_id=7,
        school_id=3,
        status=SchoolRegistrationCompletionStatus.PENDING,
        confirmation_token=token,
        payload_nonce=nonce,
        total_candidates=1,
        counts_by_type=by_type,
        counts_by_programme=by_programme,
        counts_digest=digest,
        declaration_generated_at=datetime.utcnow(),
        generation_count=1,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    qr = build_signed_qr_payload(
        exam_id=7,
        school_id=3,
        token=token,
        nonce=nonce,
        total=1,
        counts_digest=digest,
    )
    # Live counts changed (extra candidate)
    live_counts = SchoolExamCounts(
        total_candidates=2,
        counts_by_type={"fee_paying": 2, "free_tvet": 0, "referral": 0},
        counts_by_programme=[
            ProgrammeCountBreakdown(
                programme_id=1,
                code="P1",
                name="Prog",
                total=2,
                by_type={"fee_paying": 2},
            )
        ],
    )

    session = AsyncMock()
    token_result = MagicMock()
    token_result.scalar_one_or_none.return_value = row
    session.execute = AsyncMock(return_value=token_result)

    with (
        patch.object(svc, "is_school_eligible_for_exam", new=AsyncMock(return_value=True)),
        patch.object(svc, "_get_exam", new=AsyncMock(return_value=exam)),
        patch.object(svc, "is_registration_open_for_school", new=AsyncMock(return_value=True)),
        patch.object(svc, "_get_completion_row", new=AsyncMock(return_value=row)),
        patch.object(svc, "compute_school_exam_counts", new=AsyncMock(return_value=live_counts)),
    ):
        with pytest.raises(HTTPException) as exc:
            await svc.confirm_from_upload(
                session,
                exam_id=7,
                school_id=3,
                user_id=uuid4(),
                file_content=b"fake",
                filename="scan.png",
                mime_type="image/png",
                qr_payload_override=qr,
            )
        assert "counts have changed" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_notify_skips_missing_contacts_without_failing():
    from app.services import completion_confirmation_service as svc

    completion = MagicMock(spec=SchoolRegistrationCompletion)
    completion.total_candidates = 5
    completion.counts_by_type = {"fee_paying": 5, "free_tvet": 0, "referral": 0}
    completion.counts_by_programme = []
    completion.confirmed_at = datetime.utcnow()
    completion.principal_email_sent_at = None
    completion.principal_sms_sent_at = None
    completion.notify_email_error = None
    completion.notify_sms_error = None

    school = MagicMock(spec=School)
    school.principal_name = None
    school.principal_email = None
    school.principal_phone = None
    school.name = "S"
    school.code = "C1"

    exam = MagicMock(spec=RegistrationExam)
    exam.exam_type = "T"
    exam.exam_series = "S"
    exam.year = 2026

    session = AsyncMock()
    with patch("app.config.settings.sms_enabled", False):
        await svc.notify_principal_of_confirmation(
            session, completion=completion, school=school, exam=exam
        )

    assert completion.notify_email_error
    assert completion.notify_sms_error
    session.flush.assert_awaited()


def test_decode_qr_from_generated_completion_pdf():
    """Rasterized WeasyPrint completion PDF must yield a verifiable QR payload."""
    by_type = {"fee_paying": 3, "free_tvet": 1, "referral": 0}
    programmes = [
        {
            "programme_id": 1,
            "code": "P1",
            "name": "Prog One",
            "total": 4,
            "by_type": {"fee_paying": 3, "free_tvet": 1, "referral": 0},
        }
    ]
    digest = compute_counts_digest(4, by_type, programmes)
    token = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    nonce = "feedface"
    qr = build_signed_qr_payload(
        exam_id=42,
        school_id=7,
        token=token,
        nonce=nonce,
        total=4,
        counts_digest=digest,
    )
    row = SchoolRegistrationCompletion(
        id=1,
        exam_id=42,
        school_id=7,
        status=SchoolRegistrationCompletionStatus.PENDING,
        confirmation_token=token,
        payload_nonce=nonce,
        total_candidates=4,
        counts_by_type=by_type,
        counts_by_programme=programmes,
        counts_digest=digest,
        declaration_generated_at=datetime.utcnow(),
        generation_count=1,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    school = School(
        id=7,
        code="SCH007",
        name="QR Decode Test School",
        principal_name="Test Head",
    )
    exam = RegistrationExam(
        id=42,
        exam_type="Traditional",
        exam_series="May",
        year=2026,
        registration_period_id=1,
    )
    pdf_bytes = _render_declaration_pdf(
        school=school, exam=exam, row=row, qr_payload=qr
    )
    decoded = decode_qr_from_upload(
        pdf_bytes, filename="completion.pdf", mime_type="application/pdf"
    )
    body = verify_signed_qr_payload(decoded)
    assert body["e"] == 42
    assert body["s"] == 7
    assert body["t"] == token
    assert body["n"] == nonce
    assert body["tot"] == 4
    assert body["d"] == digest
