"""Tests for examiner invitation SMS and subject lock."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import ExaminerInvitationStatus, ExaminerType, Region, Subject
from app.services.examiner_invitation import (
    _as_naive_utc,
    _is_publicly_accessible,
    create_examiner_invitation,
    generate_invitation_token,
    invitation_public_url,
    invitation_summary,
    public_invitation_view,
    subject_display_code,
    update_invitation_coordination_date,
)
from app.services.sms.examiner_invitation import (
    build_examiner_invitation_message,
    render_examiner_invitation_custom_message,
)


def test_generate_invitation_token_unique() -> None:
    a = generate_invitation_token()
    b = generate_invitation_token()
    assert a != b
    # 16 url-safe bytes → ~22 characters
    assert 20 <= len(a) <= 24


def test_as_naive_utc_strips_timezone() -> None:
    aware = datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc)
    naive = _as_naive_utc(aware)
    assert naive == datetime(2026, 6, 10, 12, 0)
    assert naive.tzinfo is None


def test_as_naive_utc_passes_through_naive() -> None:
    dt = datetime(2026, 6, 10, 0, 0)
    assert _as_naive_utc(dt) is dt


def test_as_naive_utc_none() -> None:
    assert _as_naive_utc(None) is None


@pytest.mark.asyncio
async def test_create_examiner_invitation_stores_naive_coordination_date() -> None:
    session = AsyncMock()
    exam = MagicMock()
    exam.id = 1
    subject = MagicMock()
    subject.id = 209

    session.get = AsyncMock(side_effect=lambda _model, _id: exam if _id == 1 else subject)
    session.add = MagicMock()
    session.flush = AsyncMock()

    with patch(
        "app.services.examiner_invitation.assert_examiner_subject_allowed",
        new_callable=AsyncMock,
    ):
        inv = await create_examiner_invitation(
            session,
            examination_id=1,
            subject_id=209,
            name="James Yin",
            phone_number="0554210052",
            msisdn="233554210052",
            examiner_type=ExaminerType.ASSISTANT,
            region_str="Upper East",
            invited_by_user_id=uuid4(),
            response_deadline=datetime(2026, 6, 13, 12, 0),
            coordination_date=datetime(2026, 6, 10, 0, 0, tzinfo=timezone.utc),
        )

    assert inv.coordination_date == datetime(2026, 6, 10, 0, 0)
    assert inv.coordination_date.tzinfo is None
    assert inv.response_deadline == datetime(2026, 6, 13, 12, 0)
    assert inv.response_deadline.tzinfo is None


@pytest.mark.asyncio
async def test_create_examiner_invitation_requires_response_deadline() -> None:
    session = AsyncMock()
    exam = MagicMock()
    subject = MagicMock()
    session.get = AsyncMock(side_effect=lambda _model, _id: exam if _id == 1 else subject)

    with patch(
        "app.services.examiner_invitation.assert_examiner_subject_allowed",
        new_callable=AsyncMock,
    ):
        with pytest.raises(ValueError, match="Respond-by deadline is required"):
            await create_examiner_invitation(
                session,
                examination_id=1,
                subject_id=209,
                name="James Yin",
                phone_number="0554210052",
                msisdn="233554210052",
                examiner_type=ExaminerType.ASSISTANT,
                region_str="Upper East",
                invited_by_user_id=uuid4(),
                response_deadline=None,  # type: ignore[arg-type]
            )


@pytest.mark.asyncio
async def test_update_invitation_coordination_date_stores_naive() -> None:
    from app.models import ExaminerInvitation

    session = AsyncMock()
    session.flush = AsyncMock()
    inv = MagicMock(spec=ExaminerInvitation)
    inv.coordination_date = None

    await update_invitation_coordination_date(
        session,
        inv,
        datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc),
    )

    assert inv.coordination_date == datetime(2026, 7, 15, 0, 0)
    assert inv.coordination_date.tzinfo is None
    session.flush.assert_awaited_once()


def test_invitation_public_url() -> None:
    with patch("app.services.examiner_invitation.settings") as mock_settings:
        mock_settings.examiner_invitation_base_url = "https://example.com"
        mock_settings.examiner_invitation_link_path = "/ei"
        url = invitation_public_url("abc123")
    assert url == "https://example.com/ei/abc123"


def test_build_examiner_invitation_message() -> None:
    inv = MagicMock()
    inv.name = "Jane Doe"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.token = "tok"
    sub = MagicMock(spec=Subject)
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    inv.examination = exam

    with patch("app.services.examiner_invitation.settings") as mock_settings:
        mock_settings.examiner_invitation_base_url = "https://example.com"
        mock_settings.examiner_invitation_link_path = "/ei"
        msg = build_examiner_invitation_message(inv)

    assert "Jane Doe" in msg
    assert "Mathematics" in msg
    assert "BECE 2026" in msg
    assert "invited as AE" in msg
    assert "https://example.com/ei/tok" in msg


def test_subject_display_code_prefers_original_code() -> None:
    sub = MagicMock(spec=Subject)
    sub.code = "301"
    sub.original_code = "MATH301"
    assert subject_display_code(sub) == "MATH301"


def test_invitation_summary_includes_full_subject_code_fields() -> None:
    inv = MagicMock()
    inv.name = "Jane Doe"
    inv.phone_number = "0551234567"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.ASHANTI
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime(2026, 6, 12, 12, 0)
    inv.coordination_date = datetime(2026, 6, 20, 9, 0)
    inv.responded_at = None
    sub = MagicMock(spec=Subject)
    sub.code = "301"
    sub.original_code = "MATH301"
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    exam.description = None
    inv.examination = exam

    summary = invitation_summary(inv)
    assert summary["phone_number"] == "0551234567"
    assert summary["subject_code"] == "301"
    assert summary["subject_original_code"] == "MATH301"
    assert summary["coordination_date"] == datetime(2026, 6, 20, 9, 0)


def test_render_examiner_invitation_custom_message_placeholders() -> None:
    inv = MagicMock()
    inv.name = "Jane Doe"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.token = "tok"
    inv.region = Region.GREATER_ACCRA
    inv.response_deadline = datetime(2026, 6, 12, 17, 30)
    inv.coordination_date = None
    sub = MagicMock(spec=Subject)
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    inv.examination = exam

    with patch("app.services.examiner_invitation.settings") as mock_settings:
        mock_settings.examiner_invitation_base_url = "https://example.com"
        mock_settings.examiner_invitation_link_path = "/ei"
        msg = render_examiner_invitation_custom_message(
            inv,
            "Hi {name}, {subject} {exam} {role} {region} {link} by {response_deadline} on {coordination_date}",
        )

    assert "Jane Doe" in msg
    assert "Mathematics" in msg
    assert "BECE 2026" in msg
    assert "AE" in msg
    assert "Greater Accra" in msg
    assert "https://example.com/ei/tok" in msg
    assert "12 Jun 2026" in msg
    assert "on " in msg  # coordination_date empty


def test_render_examiner_invitation_custom_message_coordination_date() -> None:
    inv = MagicMock()
    inv.name = "Jane"
    inv.examiner_type = ExaminerType.CHIEF
    inv.token = "tok"
    inv.region = Region.ASHANTI
    inv.response_deadline = datetime(2026, 6, 12, 12, 0)
    inv.coordination_date = datetime(2026, 7, 1, 0, 0)
    inv.subject = MagicMock(spec=Subject)
    inv.subject.name = "Maths"
    inv.examination = MagicMock()
    inv.examination.exam_type = "BECE"
    inv.examination.year = 2026

    with patch("app.services.examiner_invitation.settings") as mock_settings:
        mock_settings.examiner_invitation_base_url = "https://example.com"
        mock_settings.examiner_invitation_link_path = "/ei"
        msg = render_examiner_invitation_custom_message(inv, "Meet on {coordination_date}")

    assert "01 Jul 2026" in msg


def test_is_coordination_sms_template() -> None:
    from app.services.sms.examiner_invitation import is_coordination_sms_template

    assert is_coordination_sms_template("Meet on {coordination_date}") is True
    assert is_coordination_sms_template("Please confirm by {response_deadline}") is False


def test_coordination_sms_bulk_selection_error_blocks_mixed_selection() -> None:
    from app.services.sms.examiner_invitation import coordination_sms_bulk_selection_error

    accepted = MagicMock()
    accepted.status = ExaminerInvitationStatus.ACCEPTED
    pending = MagicMock()
    pending.status = ExaminerInvitationStatus.PENDING

    assert coordination_sms_bulk_selection_error([accepted], "Meet on {coordination_date}") is None
    assert coordination_sms_bulk_selection_error([accepted, pending], "Meet on {coordination_date}") is not None
    assert coordination_sms_bulk_selection_error([pending], "Meet on {coordination_date}") is not None
    assert coordination_sms_bulk_selection_error([accepted, pending], "Hello {name}") is None


def test_coordination_sms_recipient_error_requires_accepted() -> None:
    from app.services.sms.examiner_invitation import (
        can_receive_coordination_sms,
        coordination_sms_recipient_error,
    )

    inv = MagicMock()
    inv.status = ExaminerInvitationStatus.PENDING
    assert can_receive_coordination_sms(inv) is False
    err = coordination_sms_recipient_error(inv, "Meet on {coordination_date}")
    assert err is not None
    assert "accepted" in err.lower()

    inv.status = ExaminerInvitationStatus.DECLINED
    assert can_receive_coordination_sms(inv) is False
    assert coordination_sms_recipient_error(inv, "Meet on {coordination_date}") is not None

    inv.status = ExaminerInvitationStatus.ACCEPTED
    assert can_receive_coordination_sms(inv) is True
    assert coordination_sms_recipient_error(inv, "Meet on {coordination_date}") is None
    assert coordination_sms_recipient_error(inv, "Hello {name}") is None


def test_build_examiner_invitation_message_typical_length_within_sms_limit() -> None:
    inv = MagicMock()
    inv.name = "James Yin"
    inv.examiner_type = ExaminerType.CHIEF
    inv.token = generate_invitation_token()
    sub = MagicMock(spec=Subject)
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    inv.examination = exam

    with patch("app.services.examiner_invitation.settings") as mock_settings:
        mock_settings.examiner_invitation_base_url = "https://monitoring.ctvet.gov.gh"
        mock_settings.examiner_invitation_link_path = "/ei"
        msg = build_examiner_invitation_message(inv)

    assert len(msg) <= 160


@pytest.mark.asyncio
async def test_assert_examiner_subject_allowed_rejects_different_subject_invitation() -> None:
    from app.services.examiner_subject_lock import assert_examiner_subject_allowed

    session = AsyncMock()
    inv = MagicMock()
    inv.status = ExaminerInvitationStatus.DECLINED
    inv.subject_id = 1

    sub_a = MagicMock(spec=Subject)
    sub_a.name = "Maths"
    sub_a.code = "MATH"

    inv_result = MagicMock()
    inv_result.scalars.return_value.all.return_value = [inv]
    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[inv_result, roster_result])
    session.get = AsyncMock(return_value=sub_a)

    with pytest.raises(ValueError, match="invited for Maths"):
        await assert_examiner_subject_allowed(
            session,
            examination_id=1,
            msisdn="233551234567",
            subject_id=2,
        )


@pytest.mark.asyncio
async def test_assert_examiner_subject_allowed_rejects_pending_duplicate() -> None:
    from app.services.examiner_subject_lock import assert_examiner_subject_allowed

    session = AsyncMock()
    inv = MagicMock()
    inv.status = ExaminerInvitationStatus.PENDING
    inv.subject_id = 1

    inv_result = MagicMock()
    inv_result.scalars.return_value.all.return_value = [inv]
    roster_result = MagicMock()
    roster_result.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[inv_result, roster_result])

    with pytest.raises(ValueError, match="already pending"):
        await assert_examiner_subject_allowed(
            session,
            examination_id=1,
            msisdn="233551234567",
            subject_id=1,
        )


@pytest.mark.asyncio
async def test_accept_examiner_invitation_creates_roster_row() -> None:
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

    with patch(
        "app.services.examiner_invitation.sync_examiner_subjects",
        new_callable=AsyncMock,
    ) as mock_sync:
        examiner = await accept_examiner_invitation(session, inv)

    assert examiner.name == "Jane"
    assert inv.status == ExaminerInvitationStatus.ACCEPTED
    assert inv.examiner_id is not None
    mock_sync.assert_awaited_once()


@pytest.mark.asyncio
async def test_decline_examiner_invitation() -> None:
    from app.models import ExaminerInvitation
    from app.services.examiner_invitation import decline_examiner_invitation

    inv = MagicMock(spec=ExaminerInvitation)
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime.utcnow() + timedelta(days=3)
    inv.token_expires_at = datetime.utcnow() - timedelta(days=1)

    session = AsyncMock()
    await decline_examiner_invitation(session, inv)

    assert inv.status == ExaminerInvitationStatus.DECLINED
    assert inv.responded_at is not None


def _mock_public_invitation(**overrides: object) -> MagicMock:
    inv = MagicMock()
    inv.name = "Jane Doe"
    inv.examiner_type = ExaminerType.ASSISTANT
    inv.region = Region.ASHANTI
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime.utcnow() + timedelta(days=2)
    inv.coordination_date = None
    inv.responded_at = None
    sub = MagicMock(spec=Subject)
    sub.code = "301"
    sub.original_code = "MATH301"
    sub.name = "Mathematics"
    inv.subject = sub
    exam = MagicMock()
    exam.exam_type = "BECE"
    exam.year = 2026
    exam.description = None
    inv.examination = exam
    for key, value in overrides.items():
        setattr(inv, key, value)
    return inv


@pytest.mark.asyncio
async def test_accept_fails_when_response_deadline_passed() -> None:
    from app.models import ExaminerInvitation
    from app.services.examiner_invitation import accept_examiner_invitation

    inv = MagicMock(spec=ExaminerInvitation)
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime.utcnow() - timedelta(hours=1)
    inv.examiner_id = None

    session = AsyncMock()
    session.flush = AsyncMock()

    with pytest.raises(ValueError, match="respond-by deadline"):
        await accept_examiner_invitation(session, inv)

    assert inv.status == ExaminerInvitationStatus.EXPIRED


@pytest.mark.asyncio
async def test_decline_fails_when_response_deadline_passed() -> None:
    from app.models import ExaminerInvitation
    from app.services.examiner_invitation import decline_examiner_invitation

    inv = MagicMock(spec=ExaminerInvitation)
    inv.status = ExaminerInvitationStatus.PENDING
    inv.response_deadline = datetime.utcnow() - timedelta(hours=1)

    session = AsyncMock()
    session.flush = AsyncMock()

    with pytest.raises(ValueError, match="respond-by deadline"):
        await decline_examiner_invitation(session, inv)

    assert inv.status == ExaminerInvitationStatus.EXPIRED


def test_public_invitation_view_pending_before_deadline_can_respond() -> None:
    inv = _mock_public_invitation()
    view = public_invitation_view(inv)
    assert view["status"] == "pending"
    assert view["can_respond"] is True
    assert _is_publicly_accessible(inv) is True


def test_public_invitation_view_pending_past_deadline_expires_and_not_accessible() -> None:
    inv = _mock_public_invitation(response_deadline=datetime.utcnow() - timedelta(hours=1))
    view = public_invitation_view(inv)
    assert view["status"] == "expired"
    assert view["can_respond"] is False
    assert _is_publicly_accessible(inv) is False


def test_public_invitation_view_accepted_permanent_access() -> None:
    inv = _mock_public_invitation(
        status=ExaminerInvitationStatus.ACCEPTED,
        response_deadline=datetime.utcnow() - timedelta(days=30),
        responded_at=datetime.utcnow() - timedelta(days=25),
    )
    view = public_invitation_view(inv)
    assert view["status"] == "accepted"
    assert view["can_respond"] is False
    assert _is_publicly_accessible(inv) is True


def test_public_invitation_view_declined_read_only() -> None:
    inv = _mock_public_invitation(
        status=ExaminerInvitationStatus.DECLINED,
        responded_at=datetime.utcnow() - timedelta(days=1),
    )
    view = public_invitation_view(inv)
    assert view["status"] == "declined"
    assert view["can_respond"] is False
    assert _is_publicly_accessible(inv) is True


def test_public_invitation_view_already_expired_not_accessible() -> None:
    inv = _mock_public_invitation(status=ExaminerInvitationStatus.EXPIRED)
    view = public_invitation_view(inv)
    assert view["status"] == "expired"
    assert view["can_respond"] is False
    assert _is_publicly_accessible(inv) is False
