"""Tests for applied-score migration on subject/paper change."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.paper_reclassify import (
    MigrationResult,
    ScoreConflict,
    _is_target_occupied,
    migrate_applied_scores_for_id_change,
    paper_label,
    rewrite_extracted_id_test_type,
)


def test_rewrite_extracted_id_test_type() -> None:
    assert rewrite_extracted_id_test_type("1234567890123", "2") == "1234567890223"
    assert rewrite_extracted_id_test_type("1234567890223", "1") == "1234567890123"


def test_rewrite_rejects_invalid() -> None:
    with pytest.raises(ValueError):
        rewrite_extracted_id_test_type("short", "1")
    with pytest.raises(ValueError):
        rewrite_extracted_id_test_type("1234567890123", "3")


def test_paper_label() -> None:
    assert paper_label("1") == "Objectives"
    assert paper_label("2") == "Essay"
    assert paper_label("3") == "Practicals"
    assert paper_label(None) is None


def test_is_target_occupied_empty() -> None:
    assert (
        _is_target_occupied(
            None, None, old_extracted_id="AAAAAAAAAAA1A", new_extracted_id="AAAAAAAAAAA2A"
        )
        is False
    )


def test_is_target_occupied_same_sheet_ids_allowed() -> None:
    assert (
        _is_target_occupied(
            "10",
            "AAAAAAAAAAA1A",
            old_extracted_id="AAAAAAAAAAA1A",
            new_extracted_id="AAAAAAAAAAA2A",
        )
        is False
    )


def test_is_target_occupied_other_sheet() -> None:
    assert (
        _is_target_occupied(
            "10",
            "OTHERSHEETXX1A",
            old_extracted_id="AAAAAAAAAAA1A",
            new_extracted_id="AAAAAAAAAAA2A",
        )
        is True
    )


def test_is_target_occupied_score_without_doc() -> None:
    assert (
        _is_target_occupied(
            "45",
            None,
            old_extracted_id="AAAAAAAAAAA1A",
            new_extracted_id="AAAAAAAAAAA2A",
        )
        is True
    )


def _score_row(**kwargs: object) -> SimpleNamespace:
    defaults = {
        "id": 1,
        "obj_raw_score": None,
        "obj_document_id": None,
        "obj_extraction_method": None,
        "obj_normalized": None,
        "essay_raw_score": None,
        "essay_document_id": None,
        "essay_extraction_method": None,
        "essay_normalized": None,
        "pract_raw_score": None,
        "pract_document_id": None,
        "pract_extraction_method": None,
        "pract_normalized": None,
        "updated_at": None,
        "subject_registration_id": 10,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _result_all(rows: list) -> MagicMock:
    result = MagicMock()
    result.all.return_value = rows
    result.scalars.return_value.all.return_value = [r[0] if isinstance(r, tuple) else r for r in rows]
    result.scalar_one_or_none.return_value = rows[0] if rows and not isinstance(rows[0], tuple) else (
        rows[0][0] if rows else None
    )
    return result


@pytest.mark.asyncio
async def test_paper_only_migrate_moves_columns() -> None:
    old_id = "1111111010101"
    new_id = "1111111010201"
    row = _score_row(
        id=7,
        obj_raw_score="18",
        obj_document_id=old_id,
        obj_extraction_method="AUTOMATED_EXTRACTION",
        obj_normalized=0.9,
    )
    candidate = SimpleNamespace(index_number="001", name="Ada")
    exam_reg = SimpleNamespace(id=5)

    session = AsyncMock()

    # Sequence: old subject meta, new subject meta, source rows join
    subject_meta_empty = MagicMock()
    subject_meta_empty.scalar_one_or_none.return_value = None

    source_result = MagicMock()
    source_result.all.return_value = [(row, candidate, exam_reg)]

    session.execute = AsyncMock(
        side_effect=[
            subject_meta_empty,  # old subject
            subject_meta_empty,  # new subject
            source_result,  # source rows
        ]
    )

    result = await migrate_applied_scores_for_id_change(
        session,
        exam_id=1,
        old_extracted_id=old_id,
        new_extracted_id=new_id,
        old_test_type="1",
        new_test_type="2",
        old_subject_id=1,
        new_subject_id=1,
        overwrite=False,
        dry_run=False,
    )

    assert result.scores_moved == 1
    assert result.paper_changed is True
    assert result.subject_changed is False
    assert row.essay_raw_score == "18"
    assert row.essay_document_id == new_id
    assert row.obj_raw_score is None
    assert row.obj_document_id is None


@pytest.mark.asyncio
async def test_paper_migrate_conflict_without_overwrite() -> None:
    old_id = "1111111010101"
    new_id = "1111111010201"
    row = _score_row(
        id=7,
        obj_raw_score="18",
        obj_document_id=old_id,
        essay_raw_score="9",
        essay_document_id="9999999999201",
    )
    candidate = SimpleNamespace(index_number="001", name="Ada")
    exam_reg = SimpleNamespace(id=5)

    session = AsyncMock()
    subject_meta_empty = MagicMock()
    subject_meta_empty.scalar_one_or_none.return_value = None
    source_result = MagicMock()
    source_result.all.return_value = [(row, candidate, exam_reg)]
    session.execute = AsyncMock(
        side_effect=[subject_meta_empty, subject_meta_empty, source_result]
    )

    result = await migrate_applied_scores_for_id_change(
        session,
        exam_id=1,
        old_extracted_id=old_id,
        new_extracted_id=new_id,
        old_test_type="1",
        new_test_type="2",
        old_subject_id=1,
        new_subject_id=1,
        overwrite=False,
        dry_run=False,
    )

    assert result.has_conflicts
    assert result.scores_moved == 0
    assert row.obj_raw_score == "18"  # unchanged
    assert row.essay_raw_score == "9"


@pytest.mark.asyncio
async def test_paper_migrate_overwrite_replaces_target() -> None:
    old_id = "1111111010101"
    new_id = "1111111010201"
    row = _score_row(
        id=7,
        obj_raw_score="18",
        obj_document_id=old_id,
        essay_raw_score="9",
        essay_document_id="9999999999201",
    )
    candidate = SimpleNamespace(index_number="001", name="Ada")
    exam_reg = SimpleNamespace(id=5)

    session = AsyncMock()
    subject_meta_empty = MagicMock()
    subject_meta_empty.scalar_one_or_none.return_value = None
    source_result = MagicMock()
    source_result.all.return_value = [(row, candidate, exam_reg)]
    session.execute = AsyncMock(
        side_effect=[subject_meta_empty, subject_meta_empty, source_result]
    )

    result = await migrate_applied_scores_for_id_change(
        session,
        exam_id=1,
        old_extracted_id=old_id,
        new_extracted_id=new_id,
        old_test_type="1",
        new_test_type="2",
        old_subject_id=1,
        new_subject_id=1,
        overwrite=True,
        dry_run=False,
    )

    assert result.scores_moved == 1
    assert row.essay_raw_score == "18"
    assert row.essay_document_id == new_id
    assert row.obj_raw_score is None


@pytest.mark.asyncio
async def test_id_only_rewrites_document_id() -> None:
    old_id = "1111111010101"
    new_id = "1111111010199"
    row = _score_row(id=3, obj_raw_score="5", obj_document_id=old_id)
    candidate = SimpleNamespace(index_number="002", name="Bob")
    exam_reg = SimpleNamespace(id=8)

    session = AsyncMock()
    subject_meta_empty = MagicMock()
    subject_meta_empty.scalar_one_or_none.return_value = None
    source_result = MagicMock()
    source_result.all.return_value = [(row, candidate, exam_reg)]
    session.execute = AsyncMock(
        side_effect=[subject_meta_empty, subject_meta_empty, source_result]
    )

    result = await migrate_applied_scores_for_id_change(
        session,
        exam_id=1,
        old_extracted_id=old_id,
        new_extracted_id=new_id,
        old_test_type="1",
        new_test_type="1",
        old_subject_id=1,
        new_subject_id=1,
        overwrite=False,
        dry_run=False,
    )

    assert result.requires_confirm is False
    assert result.scores_moved == 1
    assert row.obj_document_id == new_id
    assert row.obj_raw_score == "5"


@pytest.mark.asyncio
async def test_subject_change_dry_run_lists_conflict() -> None:
    old_id = "1111111010101"
    new_id = "1111112020101"
    source = _score_row(id=1, obj_raw_score="12", obj_document_id=old_id)
    target = _score_row(
        id=2,
        subject_registration_id=20,
        obj_raw_score="99",
        obj_document_id="9999999999101",
    )
    candidate = SimpleNamespace(index_number="003", name="Cara")
    exam_reg = SimpleNamespace(id=9)

    session = AsyncMock()
    subject_meta_empty = MagicMock()
    subject_meta_empty.scalar_one_or_none.return_value = None
    source_result = MagicMock()
    source_result.all.return_value = [(source, candidate, exam_reg)]
    exam_subject = SimpleNamespace(id=50)
    exam_subject_result = MagicMock()
    exam_subject_result.scalar_one_or_none.return_value = exam_subject
    target_reg = SimpleNamespace(id=20)
    target_reg_result = MagicMock()
    target_reg_result.scalar_one_or_none.return_value = target_reg
    target_score_result = MagicMock()
    target_score_result.scalar_one_or_none.return_value = target

    session.execute = AsyncMock(
        side_effect=[
            subject_meta_empty,
            subject_meta_empty,
            source_result,
            exam_subject_result,
            target_reg_result,
            target_score_result,
        ]
    )

    result = await migrate_applied_scores_for_id_change(
        session,
        exam_id=1,
        old_extracted_id=old_id,
        new_extracted_id=new_id,
        old_test_type="1",
        new_test_type="1",
        old_subject_id=10,
        new_subject_id=20,
        overwrite=False,
        dry_run=True,
    )

    assert result.requires_confirm is True
    assert result.subject_changed is True
    assert result.scores_to_move == 1
    assert len(result.conflicts) == 1
    assert result.conflicts[0].existing_score == "99"
    assert result.scores_moved == 0
    assert source.obj_raw_score == "12"


@pytest.mark.asyncio
async def test_subject_change_missing_registration_blocks() -> None:
    old_id = "1111111010101"
    new_id = "1111112020101"
    source = _score_row(id=1, obj_raw_score="12", obj_document_id=old_id)
    candidate = SimpleNamespace(index_number="003", name="Cara")
    exam_reg = SimpleNamespace(id=9)

    session = AsyncMock()
    subject_meta_empty = MagicMock()
    subject_meta_empty.scalar_one_or_none.return_value = None
    source_result = MagicMock()
    source_result.all.return_value = [(source, candidate, exam_reg)]
    exam_subject = SimpleNamespace(id=50)
    exam_subject_result = MagicMock()
    exam_subject_result.scalar_one_or_none.return_value = exam_subject
    target_reg_result = MagicMock()
    target_reg_result.scalar_one_or_none.return_value = None

    session.execute = AsyncMock(
        side_effect=[
            subject_meta_empty,
            subject_meta_empty,
            source_result,
            exam_subject_result,
            target_reg_result,
        ]
    )

    result = await migrate_applied_scores_for_id_change(
        session,
        exam_id=1,
        old_extracted_id=old_id,
        new_extracted_id=new_id,
        old_test_type="1",
        new_test_type="1",
        old_subject_id=10,
        new_subject_id=20,
        overwrite=False,
        dry_run=True,
    )

    assert result.has_blocking
    assert any("not registered" in e for e in result.blocking_errors)


def test_migration_result_conflict_dataclass() -> None:
    r = MigrationResult(
        conflicts=[
            ScoreConflict(
                index_number="1",
                candidate_name="X",
                existing_score="2",
                existing_document_id="Y",
            )
        ]
    )
    assert r.has_conflicts
    assert not r.has_blocking
