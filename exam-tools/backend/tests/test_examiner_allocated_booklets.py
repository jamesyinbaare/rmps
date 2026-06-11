"""Tests for allocated booklet aggregation."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services.examiner_allocated_booklets import load_allocated_booklets_map


@pytest.mark.asyncio
async def test_load_allocated_booklets_sums_latest_optimal_run_per_campaign() -> None:
    exam_id = 1
    examiner_a = uuid4()
    examiner_b = uuid4()
    subject_math = 10
    subject_eng = 20

    alloc_math_p1 = MagicMock()
    alloc_math_p1.id = uuid4()
    alloc_math_p1.subject_id = subject_math
    alloc_math_p1.paper_number = 1
    alloc_math_p2 = MagicMock()
    alloc_math_p2.id = uuid4()
    alloc_math_p2.subject_id = subject_math
    alloc_math_p2.paper_number = 2
    alloc_eng = MagicMock()
    alloc_eng.id = uuid4()
    alloc_eng.subject_id = subject_eng
    alloc_eng.paper_number = 1

    run_math_p1 = MagicMock()
    run_math_p1.id = uuid4()
    run_math_p2 = MagicMock()
    run_math_p2.id = uuid4()
    run_eng = MagicMock()
    run_eng.id = uuid4()

    assign_math_p1 = MagicMock()
    assign_math_p1.examiner_id = examiner_a
    assign_math_p1.booklet_count = 30
    assign_math_p2 = MagicMock()
    assign_math_p2.examiner_id = examiner_a
    assign_math_p2.booklet_count = 8
    assign_math_b = MagicMock()
    assign_math_b.examiner_id = examiner_b
    assign_math_b.booklet_count = 12
    assign_eng_a = MagicMock()
    assign_eng_a.examiner_id = examiner_a
    assign_eng_a.booklet_count = 5

    session = AsyncMock()

    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = [alloc_math_p1, alloc_math_p2, alloc_eng]

    run_math_p1_result = MagicMock()
    run_math_p1_result.scalar_one_or_none.return_value = run_math_p1
    run_math_p2_result = MagicMock()
    run_math_p2_result.scalar_one_or_none.return_value = run_math_p2
    run_eng_result = MagicMock()
    run_eng_result.scalar_one_or_none.return_value = run_eng

    math_p1_assign_result = MagicMock()
    math_p1_assign_result.scalars.return_value.all.return_value = [assign_math_p1, assign_math_b]
    math_p2_assign_result = MagicMock()
    math_p2_assign_result.scalars.return_value.all.return_value = [assign_math_p2]
    eng_assign_result = MagicMock()
    eng_assign_result.scalars.return_value.all.return_value = [assign_eng_a]

    session.execute = AsyncMock(
        side_effect=[
            alloc_result,
            run_math_p1_result,
            math_p1_assign_result,
            run_math_p2_result,
            math_p2_assign_result,
            run_eng_result,
            eng_assign_result,
        ]
    )

    result = await load_allocated_booklets_map(session, exam_id)

    assert result[(examiner_a, subject_math, 1)] == 30
    assert result[(examiner_b, subject_math, 1)] == 12
    assert result[(examiner_a, subject_math, 2)] == 8
    assert result[(examiner_a, subject_eng, 1)] == 5
    assert len(result) == 4


@pytest.mark.asyncio
async def test_load_allocated_booklets_skips_campaign_without_optimal_run() -> None:
    alloc = MagicMock()
    alloc.id = uuid4()
    alloc.subject_id = 1
    alloc.paper_number = 1

    session = AsyncMock()
    alloc_result = MagicMock()
    alloc_result.scalars.return_value.all.return_value = [alloc]
    run_result = MagicMock()
    run_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(side_effect=[alloc_result, run_result])

    result = await load_allocated_booklets_map(session, 99)
    assert result == {}
