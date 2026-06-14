"""Tests for examiner attendance listing."""

from __future__ import annotations

from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import Examiner, ExaminerAttendance, ExaminerSubject, ExaminerType, Region
from app.services.examiner_attendance import list_examiner_attendances


def _attendance_row(*, attendance_date: date) -> MagicMock:
    examiner_id = uuid4()
    subject = MagicMock()
    subject.original_code = "301"
    subject.code = "301"

    es = MagicMock(spec=ExaminerSubject)
    es.subject_id = 10
    es.subject = subject

    examiner = MagicMock(spec=Examiner)
    examiner.id = examiner_id
    examiner.name = "Jane Doe"
    examiner.examiner_type = ExaminerType.ASSISTANT
    examiner.region = Region.GREATER_ACCRA
    examiner.subjects = [es]

    row = MagicMock(spec=ExaminerAttendance)
    row.id = uuid4()
    row.examination_id = 1
    row.examiner_id = examiner_id
    row.reference_code = "MATH301-SAE1"
    row.attendance_date = attendance_date
    row.marked_at = datetime(2026, 6, 10, 9, 0, 0)
    row.examiner = examiner
    row.marked_by = None
    return row


@pytest.mark.asyncio
async def test_list_examiner_attendances_all_dates_includes_past_records() -> None:
    yesterday = date(2026, 6, 11)
    row = _attendance_row(attendance_date=yesterday)

    result_mock = MagicMock()
    result_mock.unique.return_value.scalars.return_value.all.return_value = [row]

    session = AsyncMock()
    session.execute = AsyncMock(return_value=result_mock)

    items = await list_examiner_attendances(
        session,
        examination_id=1,
        officer_subject_ids={10},
        all_dates=True,
    )

    assert len(items) == 1
    assert items[0]["reference_code"] == "MATH301-SAE1"
    assert items[0]["attendance_date"] == yesterday


@pytest.mark.asyncio
async def test_list_examiner_attendances_default_filters_to_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.examiner_attendance.date", MagicMock(today=lambda: date(2026, 6, 12)))

    captured: dict[str, object] = {}

    async def fake_execute(stmt):
        captured["stmt"] = stmt
        result_mock = MagicMock()
        result_mock.unique.return_value.scalars.return_value.all.return_value = []
        return result_mock

    session = AsyncMock()
    session.execute = fake_execute

    await list_examiner_attendances(session, examination_id=1, officer_subject_ids=None)

    stmt_str = str(captured["stmt"])
    assert "attendance_date" in stmt_str
