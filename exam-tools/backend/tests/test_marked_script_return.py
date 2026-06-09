"""Tests for envelope-level marked script return verification."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import AllocationRunStatus, ExaminerType, User, UserRole
from app.services.marked_script_return import (
    _row_status,
    build_return_filters,
    build_return_grid,
    unverify_return,
    upsert_return,
    verify_return,
)


def test_row_status_pending() -> None:
    assert _row_status(10, None, None) == "pending"


def test_row_status_verified() -> None:
    assert _row_status(10, 8, datetime.utcnow()) == "verified"


@pytest.mark.asyncio
async def test_build_return_grid_one_row_per_envelope() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    assignment_id = uuid4()

    examiner = MagicMock()
    examiner.id = examiner_id
    examiner.name = "Jane Doe"
    examiner.examiner_type = ExaminerType.ASSISTANT

    row = {
        "allocation_assignment_id": assignment_id,
        "examiner_id": examiner_id,
        "examiner_name": "Jane Doe",
        "examiner_type": "Assistant examiner",
        "paper_number": 1,
        "allocation_run_id": uuid4(),
        "school_code": "SCH001",
        "school_name": "Example School",
        "envelope_number": 3,
        "series_number": 1,
        "expected_booklets": 12,
        "returned_booklets": None,
        "status": "pending",
        "verified_at": None,
        "notes": None,
    }

    on_subject = MagicMock()
    on_subject.scalar_one_or_none.return_value = uuid4()

    session.get = AsyncMock(return_value=examiner)
    session.execute = AsyncMock(return_value=on_subject)

    with (
        patch(
            "app.services.marked_script_return._load_subject_allocations",
            new_callable=AsyncMock,
            return_value=([MagicMock()], "301", "Mathematics"),
        ),
        patch(
            "app.services.marked_script_return._load_existing_returns_by_assignment",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.services.marked_script_return._envelope_rows_for_examiner_paper",
            new_callable=AsyncMock,
            return_value=[row],
        ),
        patch(
            "app.services.marked_script_return.get_examiner_marking_group",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        data = await build_return_grid(
            session,
            examination_id=1,
            subject_id=10,
            examiner_id=examiner_id,
            paper_number=1,
        )

    assert data["subject_code"] == "301"
    assert data["examiner_name"] == "Jane Doe"
    assert data["paper_number"] == 1
    assert len(data["rows"]) == 1
    assert data["rows"][0]["expected_booklets"] == 12
    assert data["summary"]["pending"] == 1


@pytest.mark.asyncio
async def test_build_return_filters_lists_examiners() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    examiner = MagicMock()
    examiner.id = examiner_id
    examiner.name = "Jane Doe"
    examiner.examiner_type = ExaminerType.ASSISTANT

    allocation = MagicMock()
    allocation.paper_number = 1

    examiner_result = MagicMock()
    examiner_result.scalars.return_value.all.return_value = [examiner]

    session.execute = AsyncMock(return_value=examiner_result)

    row = {"status": "pending"}

    with (
        patch(
            "app.services.marked_script_return._load_subject_allocations",
            new_callable=AsyncMock,
            return_value=([allocation], "301", "Mathematics"),
        ),
        patch(
            "app.services.marked_script_return._load_existing_returns_by_assignment",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.services.marked_script_return._envelope_rows_for_examiner_paper",
            new_callable=AsyncMock,
            return_value=[row],
        ),
        patch(
            "app.services.marked_script_return._counts_from_rows",
            return_value=(2, 1),
        ),
    ):
        data = await build_return_filters(session, examination_id=1, subject_id=10)

    assert len(data["examiners"]) == 1
    assert data["examiners"][0]["examiner_id"] == examiner_id
    assert data["examiners"][0]["pending_count"] == 2
    assert data["papers"] == []


@pytest.mark.asyncio
async def test_build_return_filters_lists_papers_for_examiner() -> None:
    session = AsyncMock()
    examiner_id = uuid4()
    examiner = MagicMock()
    examiner.id = examiner_id

    allocation1 = MagicMock()
    allocation1.paper_number = 1
    allocation2 = MagicMock()
    allocation2.paper_number = 2

    session.get = AsyncMock(return_value=examiner)

    with (
        patch(
            "app.services.marked_script_return._load_subject_allocations",
            new_callable=AsyncMock,
            return_value=([allocation1, allocation2], "301", "Mathematics"),
        ),
        patch(
            "app.services.marked_script_return._load_existing_returns_by_assignment",
            new_callable=AsyncMock,
            return_value={},
        ),
        patch(
            "app.services.marked_script_return._envelope_rows_for_examiner_paper",
            new_callable=AsyncMock,
            side_effect=[[{"status": "pending"}], []],
        ),
        patch(
            "app.services.marked_script_return._counts_from_rows",
            side_effect=[(1, 0), (0, 0)],
        ),
    ):
        data = await build_return_filters(
            session,
            examination_id=1,
            subject_id=10,
            examiner_id=examiner_id,
        )

    assert data["examiners"] == []
    assert len(data["papers"]) == 1
    assert data["papers"][0]["paper_number"] == 1
    assert data["papers"][0]["pending_count"] == 1


@pytest.mark.asyncio
async def test_upsert_return_creates_envelope_record() -> None:
    session = AsyncMock()
    assignment_id = uuid4()
    examiner_id = uuid4()
    run_id = uuid4()
    allocation_id = uuid4()
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.role = UserRole.SUBJECT_OFFICER

    assignment = MagicMock()
    assignment.id = assignment_id
    assignment.booklet_count = 8

    allocation = MagicMock()
    allocation.id = allocation_id
    allocation.examination_id = 1
    allocation.subject_id = 10
    allocation.paper_number = 1

    run = MagicMock()
    run.id = run_id
    run.status = AllocationRunStatus.OPTIMAL

    examiner = MagicMock()
    examiner.id = examiner_id

    env = MagicMock()
    series = MagicMock()
    school = MagicMock()

    with patch(
        "app.services.marked_script_return._load_assignment_context",
        new_callable=AsyncMock,
        return_value=(assignment, allocation, run, examiner, env, series, school),
    ):
        missing = MagicMock()
        missing.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=missing)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        await upsert_return(
            session,
            examination_id=1,
            subject_id=10,
            assignment_id=assignment_id,
            returned_booklets=8,
            notes=None,
            user=user,
        )

    assert session.add.called
    added = session.add.call_args[0][0]
    assert added.allocation_assignment_id == assignment_id
    assert added.expected_booklets == 8
    assert added.returned_booklets == 8


@pytest.mark.asyncio
async def test_verify_return_creates_record_with_expected_count() -> None:
    session = AsyncMock()
    assignment_id = uuid4()
    examiner_id = uuid4()
    run_id = uuid4()
    allocation_id = uuid4()
    user = MagicMock(spec=User)
    user.id = uuid4()

    assignment = MagicMock()
    assignment.id = assignment_id
    assignment.booklet_count = 8

    allocation = MagicMock()
    allocation.id = allocation_id
    allocation.examination_id = 1
    allocation.subject_id = 10
    allocation.paper_number = 1

    run = MagicMock()
    run.id = run_id

    examiner = MagicMock()
    examiner.id = examiner_id

    env = MagicMock()
    series = MagicMock()
    school = MagicMock()

    with patch(
        "app.services.marked_script_return._load_assignment_context",
        new_callable=AsyncMock,
        return_value=(assignment, allocation, run, examiner, env, series, school),
    ):
        missing = MagicMock()
        missing.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=missing)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        record = await verify_return(
            session,
            examination_id=1,
            subject_id=10,
            assignment_id=assignment_id,
            notes=None,
            allow_mismatch=False,
            user=user,
        )

    assert session.add.called
    added = session.add.call_args[0][0]
    assert added.returned_booklets == 8
    assert added.expected_booklets == 8
    assert added.verified_at is not None
    assert added.verified_by_id == user.id
    assert record.returned_booklets == 8


@pytest.mark.asyncio
async def test_verify_return_rejects_already_verified() -> None:
    session = AsyncMock()
    assignment_id = uuid4()
    user = MagicMock(spec=User)
    user.id = uuid4()

    assignment = MagicMock()
    assignment.booklet_count = 8

    record = MagicMock()
    record.verified_at = datetime.utcnow()

    with patch(
        "app.services.marked_script_return._load_assignment_context",
        new_callable=AsyncMock,
        return_value=(assignment, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock()),
    ):
        found = MagicMock()
        found.scalar_one_or_none.return_value = record
        session.execute = AsyncMock(return_value=found)

        with pytest.raises(HTTPException) as exc:
            await verify_return(
                session,
                examination_id=1,
                subject_id=10,
                assignment_id=assignment_id,
                notes=None,
                allow_mismatch=False,
                user=user,
            )
    assert exc.value.status_code == 400
    assert exc.value.detail == "Return already verified"


@pytest.mark.asyncio
async def test_unverify_return_clears_verification() -> None:
    session = AsyncMock()
    assignment_id = uuid4()
    user = MagicMock(spec=User)
    user.id = uuid4()

    assignment = MagicMock()
    assignment.booklet_count = 8

    record = MagicMock()
    record.verified_at = datetime.utcnow()
    record.verified_by_id = user.id
    record.returned_booklets = 8

    with patch(
        "app.services.marked_script_return._load_assignment_context",
        new_callable=AsyncMock,
        return_value=(assignment, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock()),
    ):
        found = MagicMock()
        found.scalar_one_or_none.return_value = record
        session.execute = AsyncMock(return_value=found)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        result = await unverify_return(
            session,
            examination_id=1,
            subject_id=10,
            assignment_id=assignment_id,
            user=user,
        )

    assert record.verified_at is None
    assert record.verified_by_id is None
    assert record.returned_booklets == 8
    assert result is record


@pytest.mark.asyncio
async def test_unverify_return_rejects_not_verified() -> None:
    session = AsyncMock()
    assignment_id = uuid4()
    user = MagicMock(spec=User)

    with patch(
        "app.services.marked_script_return._load_assignment_context",
        new_callable=AsyncMock,
        return_value=(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock()),
    ):
        missing = MagicMock()
        missing.scalar_one_or_none.return_value = None
        session.execute = AsyncMock(return_value=missing)

        with pytest.raises(HTTPException) as exc:
            await unverify_return(
                session,
                examination_id=1,
                subject_id=10,
                assignment_id=assignment_id,
                user=user,
            )
    assert exc.value.status_code == 400
    assert exc.value.detail == "Return is not verified"
