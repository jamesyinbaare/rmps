"""Tests for lunch coupon QR verification."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import ExaminerType, Region, User, UserRole
from app.routers.subject_officer_lunch_verify import post_lunch_coupon_verify
from app.schemas.lunch_coupon_verify import LunchCouponVerifyRequest
from app.services.lunch_coupon_verify import (
    resolve_examiner_for_scan,
    resolve_examiner_for_scan_payload,
    verify_and_record_lunch_coupon,
    verify_and_record_lunch_coupon_scan,
    verify_lunch_coupon,
)
from app.services.qr_code import generate_qr_code_base64
from app.services.script_allocation_form_pdf import _render_one_examiner_pdf_sync


def test_generate_qr_code_base64_returns_non_empty() -> None:
    encoded = generate_qr_code_base64("NAE1")
    assert encoded
    assert isinstance(encoded, str)


def test_generate_qr_code_base64_rejects_empty_payload() -> None:
    with pytest.raises(ValueError, match="empty"):
        generate_qr_code_base64("  ")


def test_render_context_includes_qr_when_reference_code_present() -> None:
    with patch("app.services.script_allocation_form_pdf.generate_qr_code_base64", return_value="abc123") as mock_qr:
        with patch("app.services.script_allocation_form_pdf.render_html") as mock_render:
            mock_render.return_value = "<html></html>"
            with patch("app.services.script_allocation_form_pdf.PdfGenerator") as mock_gen:
                mock_gen.return_value.render_pdf.return_value = b"%PDF"
                _render_one_examiner_pdf_sync(
                    examination_id=42,
                    examination_label_str="NovDec 2026",
                    year=2026,
                    subject_label="Mathematics (301)",
                    paper_number=1,
                    examiner_name="Jane Doe",
                    examiner_region="Ashanti",
                    reference_code="MATH301-NAE1",
                    rows=[
                        {
                            "school_name": "Sample SHS",
                            "envelope_number": 1,
                            "series_number": 1,
                            "booklet_count": 5,
                        }
                    ],
                    total_count=5,
                )

    mock_qr.assert_called_once_with("42:MATH301-NAE1")
    context = mock_render.call_args[0][0]
    assert context["reference_code"] == "MATH301-NAE1"
    assert context["qr_code_base64"] == "abc123"


@pytest.mark.asyncio
async def test_verify_lunch_coupon_valid_when_subject_overlaps() -> None:
    session = AsyncMock()
    subject = MagicMock()
    subject.code = "301"
    subject.original_code = None

    es = MagicMock()
    es.subject_id = 10
    es.subject = subject

    examiner = MagicMock()
    examiner.reference_code = "NAE1"
    examiner.name = "Jane Doe"
    examiner.examiner_type = ExaminerType.ASSISTANT
    examiner.region = Region.ASHANTI
    examiner.subjects = [es]

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = examiner
    session.execute = AsyncMock(return_value=result_mock)

    result = await verify_lunch_coupon(
        session,
        examination_id=1,
        officer_subject_ids={10},
        reference_code="nae1",
    )

    assert result["valid"] is True
    assert result["reference_code"] == "NAE1"
    assert result["name"] == "Jane Doe"
    assert result["subject_codes"] == ["301"]


@pytest.mark.asyncio
async def test_verify_lunch_coupon_invalid_when_code_unknown() -> None:
    session = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=result_mock)

    result = await verify_lunch_coupon(
        session,
        examination_id=1,
        officer_subject_ids={10},
        reference_code="ZZZ9",
    )

    assert result["valid"] is False
    assert "No examiner" in result["message"]


@pytest.mark.asyncio
async def test_verify_lunch_coupon_invalid_when_subject_mismatch() -> None:
    session = AsyncMock()
    es = MagicMock()
    es.subject_id = 20
    es.subject = MagicMock(code="401", original_code=None)

    examiner = MagicMock()
    examiner.reference_code = "NAE1"
    examiner.name = "Jane Doe"
    examiner.examiner_type = ExaminerType.ASSISTANT
    examiner.region = Region.ASHANTI
    examiner.subjects = [es]

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = examiner
    session.execute = AsyncMock(return_value=result_mock)

    result = await verify_lunch_coupon(
        session,
        examination_id=1,
        officer_subject_ids={10},
        reference_code="NAE1",
    )

    assert result["valid"] is False
    assert "not on your subject roster" in result["message"]


@pytest.mark.asyncio
async def test_verify_and_record_rejects_already_verified() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    user_id = uuid4()

    subject = MagicMock()
    subject.code = "301"
    subject.original_code = None
    es = MagicMock()
    es.subject_id = 10
    es.subject = subject

    examiner = MagicMock()
    examiner.id = examiner_id
    examiner.reference_code = "NAE1"
    examiner.name = "Jane Doe"
    examiner.examiner_type = ExaminerType.ASSISTANT
    examiner.region = Region.ASHANTI
    examiner.subjects = [es]

    verified_by = MagicMock()
    verified_by.full_name = "Officer One"
    existing = MagicMock()
    from datetime import datetime

    existing.verified_at = datetime(2026, 6, 12, 10, 30)
    existing.verified_by = verified_by

    with (
        patch(
            "app.services.lunch_coupon_verify.verify_lunch_coupon",
            new=AsyncMock(
                return_value={
                    "valid": True,
                    "reference_code": "NAE1",
                    "name": "Jane Doe",
                    "examiner_id": examiner_id,
                    "examiner_type": "assistant_examiner",
                    "examiner_type_label": "Assistant examiner",
                    "region": "Ashanti",
                    "subject_codes": ["301"],
                }
            ),
        ),
        patch(
            "app.services.lunch_coupon_verify._load_existing_verification",
            new=AsyncMock(return_value=existing),
        ),
    ):
        result = await verify_and_record_lunch_coupon(
            session,
            examination_id=1,
            officer_subject_ids={10},
            reference_code="NAE1",
            verified_by_id=user_id,
        )

    assert result["valid"] is False
    assert result["already_verified"] is True
    assert result["recorded"] is False
    assert result["verified_by_name"] == "Officer One"
    assert "already verified" in result["message"].lower()


@pytest.mark.asyncio
async def test_post_lunch_coupon_verify_403_when_officer_not_assigned() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.role = UserRole.SUBJECT_OFFICER
    user.id = uuid4()

    with (
        patch(
            "app.routers.subject_officer_lunch_verify.assert_subject_officer_examination_access",
            new=AsyncMock(side_effect=HTTPException(status_code=403, detail="No subject assignment")),
        ),
        patch(
            "app.routers.subject_officer_lunch_verify.verify_and_record_lunch_coupon",
            new=AsyncMock(),
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            await post_lunch_coupon_verify(
                examination_id=1,
                body=LunchCouponVerifyRequest(reference_code="NAE1"),
                session=session,
                user=user,
            )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_resolve_examiner_for_scan_single_match() -> None:
    session = AsyncMock()
    subject = MagicMock()
    subject.code = "301"
    subject.original_code = None

    es = MagicMock()
    es.subject_id = 10
    es.subject = subject

    exam = MagicMock()
    exam.created_at = __import__("datetime").datetime(2026, 6, 1)

    examiner = MagicMock()
    examiner.examination_id = 1
    examiner.examination = exam
    examiner.subjects = [es]

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [examiner]
    session.execute = AsyncMock(return_value=result_mock)

    resolved = await resolve_examiner_for_scan(
        session,
        "nae1",
        examination_ids=[1],
        officer_subject_ids_by_exam={1: {10}},
    )

    assert resolved is not None
    assert resolved[1] == 1
    assert resolved[2] == 10


@pytest.mark.asyncio
async def test_resolve_examiner_for_scan_picks_latest_examination() -> None:
    session = AsyncMock()
    subject = MagicMock()
    subject.code = "301"
    subject.original_code = None

    def make_examiner(exam_id: int, created) -> MagicMock:
        es = MagicMock()
        es.subject_id = 10
        es.subject = subject
        exam = MagicMock()
        exam.created_at = created
        ex = MagicMock()
        ex.examination_id = exam_id
        ex.examination = exam
        ex.subjects = [es]
        return ex

    older = make_examiner(1, __import__("datetime").datetime(2025, 6, 1))
    newer = make_examiner(2, __import__("datetime").datetime(2026, 6, 1))

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [older, newer]
    session.execute = AsyncMock(return_value=result_mock)

    resolved = await resolve_examiner_for_scan(
        session,
        "NAE1",
        examination_ids=[1, 2],
        officer_subject_ids_by_exam={1: {10}, 2: {10}},
    )

    assert resolved is not None
    assert resolved[1] == 2


@pytest.mark.asyncio
async def test_resolve_examiner_for_scan_rejects_subject_mismatch() -> None:
    session = AsyncMock()
    subject = MagicMock()
    subject.code = "401"
    subject.original_code = None

    es = MagicMock()
    es.subject_id = 20
    es.subject = subject

    exam = MagicMock()
    exam.created_at = __import__("datetime").datetime(2026, 6, 1)

    examiner = MagicMock()
    examiner.examination_id = 1
    examiner.examination = exam
    examiner.subjects = [es]

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [examiner]
    session.execute = AsyncMock(return_value=result_mock)

    resolved = await resolve_examiner_for_scan(
        session,
        "NAE1",
        examination_ids=[1],
        officer_subject_ids_by_exam={1: {10}},
    )

    assert resolved is None


@pytest.mark.asyncio
async def test_resolve_examiner_for_scan_payload_uses_direct_lookup_with_exam_id() -> None:
    session = AsyncMock()
    subject = MagicMock()
    subject.code = "301"
    subject.original_code = None

    es = MagicMock()
    es.subject_id = 10
    es.subject = subject

    examiner = MagicMock()
    examiner.examination_id = 42
    examiner.subjects = [es]

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = examiner
    session.execute = AsyncMock(return_value=result_mock)

    resolved = await resolve_examiner_for_scan_payload(
        session,
        "42:MATH301-NAE1",
        examination_ids=[42],
        officer_subject_ids_by_exam={42: {10}},
    )

    assert resolved is not None
    assert resolved[1] == 42
    assert resolved[2] == 10


@pytest.mark.asyncio
async def test_resolve_examiner_for_scan_payload_rejects_unassigned_exam() -> None:
    session = AsyncMock()
    resolved = await resolve_examiner_for_scan_payload(
        session,
        "99:MATH301-NAE1",
        examination_ids=[42],
        officer_subject_ids_by_exam={42: {10}},
    )
    assert resolved is None
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_examiner_for_scan_payload_falls_back_for_plain_code() -> None:
    session = AsyncMock()
    with patch(
        "app.services.lunch_coupon_verify.resolve_examiner_for_scan",
        new=AsyncMock(return_value=(MagicMock(), 1, 10)),
    ) as mock_legacy:
        resolved = await resolve_examiner_for_scan_payload(
            session,
            "MATH301-NAE1",
            examination_ids=[1],
            officer_subject_ids_by_exam={1: {10}},
        )

    assert resolved is not None
    mock_legacy.assert_awaited_once_with(
        session,
        "MATH301-NAE1",
        examination_ids=[1],
        officer_subject_ids_by_exam={1: {10}},
    )


@pytest.mark.asyncio
async def test_verify_and_record_lunch_coupon_scan_delegates_to_exam_scoped_flow() -> None:
    session = AsyncMock()
    examiner = MagicMock()
    examiner.examination_id = 2

    with (
        patch(
            "app.services.lunch_coupon_verify.resolve_examiner_for_scan_payload",
            new=AsyncMock(return_value=(examiner, 2, 10)),
        ),
        patch(
            "app.services.lunch_coupon_verify.verify_and_record_lunch_coupon",
            new=AsyncMock(return_value={"valid": True, "recorded": True, "examination_id": 2}),
        ) as mock_record,
    ):
        result = await verify_and_record_lunch_coupon_scan(
            session,
            examination_ids=[1, 2],
            officer_subject_ids_by_exam={1: {10}, 2: {10}},
            reference_code="2:MATH301-NAE1",
            verified_by_id=uuid4(),
        )

    assert result["valid"] is True
    mock_record.assert_awaited_once()
    assert mock_record.await_args.kwargs["examination_id"] == 2
    assert mock_record.await_args.kwargs["reference_code"] == "MATH301-NAE1"
