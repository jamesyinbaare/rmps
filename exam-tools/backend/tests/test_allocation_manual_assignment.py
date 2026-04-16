"""Manual allocation assignment upsert/delete (mocked session)."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import AllocationAssignment, AllocationExaminer, AllocationRun, Examiner
from app.services.script_allocation import (
    ManualAssignmentError,
    delete_manual_assignment,
    upsert_manual_assignment,
)


@pytest.mark.asyncio
async def test_upsert_manual_assignment_run_not_found() -> None:
    session = AsyncMock()
    with patch(
        "app.services.script_allocation.load_run_with_assignments",
        new_callable=AsyncMock,
        return_value=None,
    ):
        with pytest.raises(ManualAssignmentError) as exc:
            await upsert_manual_assignment(session, uuid4(), uuid4(), uuid4())
    assert exc.value.status_code == 404
    assert exc.value.detail == "Run not found"


@pytest.mark.asyncio
async def test_upsert_manual_assignment_envelope_not_in_pool() -> None:
    run_id = uuid4()
    alloc_id = uuid4()
    run = MagicMock(spec=AllocationRun)
    run.allocation_id = alloc_id
    allocation = MagicMock()
    allocation.id = alloc_id
    allocation.subject_id = 1

    session = AsyncMock()
    with (
        patch("app.services.script_allocation.load_run_with_assignments", new_callable=AsyncMock, return_value=run),
        patch("app.services.script_allocation.load_allocation_or_none", new_callable=AsyncMock, return_value=allocation),
        patch("app.services.script_allocation.load_envelopes_for_allocation", new_callable=AsyncMock, return_value=[]),
    ):
        with pytest.raises(ManualAssignmentError) as exc:
            await upsert_manual_assignment(session, run_id, uuid4(), uuid4())
    assert exc.value.status_code == 404
    assert exc.value.detail == "Script envelope not in this allocation pool"


@pytest.mark.asyncio
async def test_upsert_manual_assignment_examiner_not_in_campaign() -> None:
    run_id = uuid4()
    env_id = uuid4()
    ex_id = uuid4()
    alloc_id = uuid4()

    run = MagicMock(spec=AllocationRun)
    run.allocation_id = alloc_id
    allocation = MagicMock()
    allocation.id = alloc_id
    allocation.subject_id = 5

    env = MagicMock()
    env.id = env_id
    env.booklet_count = 2
    series = MagicMock()
    series.subject_id = 5
    school = MagicMock()

    session = AsyncMock()
    session.get = AsyncMock(return_value=None)

    examiner = MagicMock(spec=Examiner)
    examiner.subjects = [MagicMock(subject_id=5)]

    r_ex = MagicMock()
    r_ex.scalar_one_or_none.return_value = examiner

    with (
        patch("app.services.script_allocation.load_run_with_assignments", new_callable=AsyncMock, return_value=run),
        patch("app.services.script_allocation.load_allocation_or_none", new_callable=AsyncMock, return_value=allocation),
        patch(
            "app.services.script_allocation.load_envelopes_for_allocation",
            new_callable=AsyncMock,
            return_value=[(env, series, school)],
        ),
    ):
        session.execute = AsyncMock(return_value=r_ex)
        with pytest.raises(ManualAssignmentError) as exc:
            await upsert_manual_assignment(session, run_id, env_id, ex_id)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Examiner is not in this allocation campaign"


@pytest.mark.asyncio
async def test_upsert_manual_assignment_subject_not_eligible() -> None:
    run_id = uuid4()
    env_id = uuid4()
    ex_id = uuid4()
    alloc_id = uuid4()

    run = MagicMock(spec=AllocationRun)
    run.allocation_id = alloc_id
    allocation = MagicMock()
    allocation.id = alloc_id
    allocation.subject_id = 5

    env = MagicMock()
    env.id = env_id
    env.booklet_count = 2
    series = MagicMock()
    series.subject_id = 5
    school = MagicMock()

    member = MagicMock(spec=AllocationExaminer)
    examiner = MagicMock(spec=Examiner)
    examiner.subjects = [MagicMock(subject_id=99)]

    r_ex = MagicMock()
    r_ex.scalar_one_or_none.return_value = examiner

    session = AsyncMock()

    async def get_side_effect(model, key, **kwargs):
        if model is AllocationExaminer:
            return member
        return None

    session.get = AsyncMock(side_effect=get_side_effect)
    session.execute = AsyncMock(return_value=r_ex)

    with (
        patch("app.services.script_allocation.load_run_with_assignments", new_callable=AsyncMock, return_value=run),
        patch("app.services.script_allocation.load_allocation_or_none", new_callable=AsyncMock, return_value=allocation),
        patch(
            "app.services.script_allocation.load_envelopes_for_allocation",
            new_callable=AsyncMock,
            return_value=[(env, series, school)],
        ),
    ):
        with pytest.raises(ManualAssignmentError) as exc:
            await upsert_manual_assignment(session, run_id, env_id, ex_id)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Examiner is not eligible for this allocation subject"


@pytest.mark.asyncio
async def test_upsert_manual_assignment_inserts_new_row() -> None:
    run_id = uuid4()
    env_id = uuid4()
    ex_id = uuid4()
    alloc_id = uuid4()

    run = MagicMock(spec=AllocationRun)
    run.allocation_id = alloc_id
    allocation = MagicMock()
    allocation.id = alloc_id
    allocation.subject_id = 5

    env = MagicMock()
    env.id = env_id
    env.booklet_count = 7
    series = MagicMock()
    series.subject_id = 5
    school = MagicMock()

    member = MagicMock(spec=AllocationExaminer)
    examiner = MagicMock(spec=Examiner)
    examiner.subjects = [MagicMock(subject_id=5)]

    r_ex = MagicMock()
    r_ex.scalar_one_or_none.return_value = examiner
    r_none = MagicMock()
    r_none.scalar_one_or_none.return_value = None

    session = AsyncMock()
    session.add = MagicMock()

    async def get_side_effect(model, key, **kwargs):
        if model is AllocationExaminer:
            return member
        return None

    session.get = AsyncMock(side_effect=get_side_effect)
    session.execute = AsyncMock(side_effect=[r_ex, r_none])

    with (
        patch("app.services.script_allocation.load_run_with_assignments", new_callable=AsyncMock, return_value=run),
        patch("app.services.script_allocation.load_allocation_or_none", new_callable=AsyncMock, return_value=allocation),
        patch(
            "app.services.script_allocation.load_envelopes_for_allocation",
            new_callable=AsyncMock,
            return_value=[(env, series, school)],
        ),
    ):
        await upsert_manual_assignment(session, run_id, env_id, ex_id)

    session.add.assert_called_once()
    added = session.add.call_args[0][0]
    assert isinstance(added, AllocationAssignment)
    assert added.allocation_run_id == run_id
    assert added.script_envelope_id == env_id
    assert added.examiner_id == ex_id
    assert added.booklet_count == 7
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_upsert_manual_assignment_updates_existing_row() -> None:
    run_id = uuid4()
    env_id = uuid4()
    ex_id = uuid4()
    ex_id2 = uuid4()
    alloc_id = uuid4()

    run = MagicMock(spec=AllocationRun)
    run.allocation_id = alloc_id
    allocation = MagicMock()
    allocation.id = alloc_id
    allocation.subject_id = 5

    env = MagicMock()
    env.id = env_id
    env.booklet_count = 4
    series = MagicMock()
    series.subject_id = 5
    school = MagicMock()

    member = MagicMock(spec=AllocationExaminer)
    examiner = MagicMock(spec=Examiner)
    examiner.subjects = [MagicMock(subject_id=5)]

    existing = MagicMock(spec=AllocationAssignment)
    existing.examiner_id = ex_id
    existing.booklet_count = 1

    r_ex = MagicMock()
    r_ex.scalar_one_or_none.return_value = examiner
    r_exist = MagicMock()
    r_exist.scalar_one_or_none.return_value = existing

    session = AsyncMock()

    async def get_side_effect(model, key, **kwargs):
        if model is AllocationExaminer:
            return member
        return None

    session.get = AsyncMock(side_effect=get_side_effect)
    session.execute = AsyncMock(side_effect=[r_ex, r_exist])

    with (
        patch("app.services.script_allocation.load_run_with_assignments", new_callable=AsyncMock, return_value=run),
        patch("app.services.script_allocation.load_allocation_or_none", new_callable=AsyncMock, return_value=allocation),
        patch(
            "app.services.script_allocation.load_envelopes_for_allocation",
            new_callable=AsyncMock,
            return_value=[(env, series, school)],
        ),
    ):
        await upsert_manual_assignment(session, run_id, env_id, ex_id2)

    assert existing.examiner_id == ex_id2
    assert existing.booklet_count == 4
    session.add.assert_not_called()
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_manual_assignment_run_not_found() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=None)
    with pytest.raises(ManualAssignmentError) as exc:
        await delete_manual_assignment(session, uuid4(), uuid4())
    assert exc.value.status_code == 404
    assert exc.value.detail == "Run not found"


@pytest.mark.asyncio
async def test_delete_manual_assignment_not_found() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=MagicMock(spec=AllocationRun))
    del_result = MagicMock()
    del_result.rowcount = 0
    session.execute = AsyncMock(return_value=del_result)
    with pytest.raises(ManualAssignmentError) as exc:
        await delete_manual_assignment(session, uuid4(), uuid4())
    assert exc.value.status_code == 404
    assert exc.value.detail == "Assignment not found"


@pytest.mark.asyncio
async def test_delete_manual_assignment_ok() -> None:
    session = AsyncMock()
    session.get = AsyncMock(return_value=MagicMock(spec=AllocationRun))
    del_result = MagicMock()
    del_result.rowcount = 1
    session.execute = AsyncMock(return_value=del_result)
    await delete_manual_assignment(session, uuid4(), uuid4())
    session.flush.assert_awaited_once()
