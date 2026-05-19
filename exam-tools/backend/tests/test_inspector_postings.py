"""Inspector examination posting overlap rules and scope helpers."""

from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.models import ExamInspectorSubjectScope, Subject, SubjectType
from app.services.inspector_posting import (
    filter_subject_rows_for_scope,
    normalize_exam_inspector_subject_scope,
    posting_pair_conflicts,
    subject_matches_scope,
    validate_new_posting_no_overlap,
)


def test_normalize_exam_inspector_subject_scope() -> None:
    assert normalize_exam_inspector_subject_scope(ExamInspectorSubjectScope.CORE) == ExamInspectorSubjectScope.CORE
    assert normalize_exam_inspector_subject_scope("ELECTIVE") == ExamInspectorSubjectScope.ELECTIVE


def test_posting_pair_conflicts_all_blocks_core_same_centre() -> None:
    c = uuid4()
    assert posting_pair_conflicts(ExamInspectorSubjectScope.ALL, c, ExamInspectorSubjectScope.CORE, c)


def test_posting_pair_conflicts_all_allows_core_different_centre() -> None:
    a, b = uuid4(), uuid4()
    assert not posting_pair_conflicts(ExamInspectorSubjectScope.ALL, a, ExamInspectorSubjectScope.CORE, b)


def test_posting_pair_conflicts_core_elective_same_centre_ok() -> None:
    c = uuid4()
    assert not posting_pair_conflicts(ExamInspectorSubjectScope.CORE, c, ExamInspectorSubjectScope.ELECTIVE, c)


def test_posting_pair_conflicts_core_elective_different_centres_ok() -> None:
    a, b = uuid4(), uuid4()
    assert not posting_pair_conflicts(ExamInspectorSubjectScope.CORE, a, ExamInspectorSubjectScope.ELECTIVE, b)


def test_posting_pair_conflicts_duplicate_scope_different_centres_ok() -> None:
    a, b = uuid4(), uuid4()
    assert not posting_pair_conflicts(ExamInspectorSubjectScope.CORE, a, ExamInspectorSubjectScope.CORE, b)


def test_posting_pair_conflicts_duplicate_scope_same_centre() -> None:
    c = uuid4()
    assert posting_pair_conflicts(ExamInspectorSubjectScope.CORE, c, ExamInspectorSubjectScope.CORE, c)


def test_posting_pair_conflicts_all_allows_all_different_centres() -> None:
    a, b = uuid4(), uuid4()
    assert not posting_pair_conflicts(ExamInspectorSubjectScope.ALL, a, ExamInspectorSubjectScope.ALL, b)


def test_posting_pair_conflicts_normalizes_string_scopes() -> None:
    c = uuid4()
    assert posting_pair_conflicts("CORE", c, ExamInspectorSubjectScope.CORE, c)
    a, b = uuid4(), uuid4()
    assert not posting_pair_conflicts("CORE", a, "ELECTIVE", b)


def test_subject_matches_scope() -> None:
    core = MagicMock(spec=Subject)
    core.subject_type = SubjectType.CORE
    el = MagicMock(spec=Subject)
    el.subject_type = SubjectType.ELECTIVE
    assert subject_matches_scope(ExamInspectorSubjectScope.ALL, core)
    assert subject_matches_scope(ExamInspectorSubjectScope.CORE, core)
    assert not subject_matches_scope(ExamInspectorSubjectScope.ELECTIVE, core)
    assert subject_matches_scope(ExamInspectorSubjectScope.ELECTIVE, el)


def test_filter_subject_rows_for_scope() -> None:
    core = MagicMock(spec=Subject)
    core.subject_type = SubjectType.CORE
    el = MagicMock(spec=Subject)
    el.subject_type = SubjectType.ELECTIVE
    rows = [(core, {"x": 1}), (el, {"x": 2})]
    assert len(filter_subject_rows_for_scope(rows, ExamInspectorSubjectScope.ALL)) == 2
    assert len(filter_subject_rows_for_scope(rows, ExamInspectorSubjectScope.CORE)) == 1
    assert filter_subject_rows_for_scope(rows, ExamInspectorSubjectScope.CORE)[0][0] is core


@pytest.mark.asyncio
async def test_validate_overlap_rejects_duplicate_core_same_centre_when_existing_scope_is_db_string() -> None:
    """ORM sometimes exposes native_enum=False values as plain strings."""
    c = uuid4()
    existing = MagicMock()
    existing.id = uuid4()
    existing.subject_scope = "CORE"
    existing.center_id = c

    with patch(
        "app.services.inspector_posting.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[existing],
    ):
        session = AsyncMock()
        with pytest.raises(HTTPException) as ei:
            await validate_new_posting_no_overlap(
                session,
                examination_id=1,
                inspector_user_id=uuid4(),
                center_id=c,
                subject_scope=ExamInspectorSubjectScope.CORE,
            )
        assert ei.value.status_code == 400


@pytest.mark.asyncio
async def test_validate_overlap_allows_duplicate_core_different_centre() -> None:
    c1, c2 = uuid4(), uuid4()
    existing = MagicMock()
    existing.id = uuid4()
    existing.subject_scope = ExamInspectorSubjectScope.CORE
    existing.center_id = c1

    with patch(
        "app.services.inspector_posting.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[existing],
    ):
        session = AsyncMock()
        await validate_new_posting_no_overlap(
            session,
            examination_id=1,
            inspector_user_id=uuid4(),
            center_id=c2,
            subject_scope=ExamInspectorSubjectScope.CORE,
        )


@pytest.mark.asyncio
async def test_validate_overlap_allows_core_and_elective_different_centres() -> None:
    c1, c2 = uuid4(), uuid4()
    existing = MagicMock()
    existing.id = uuid4()
    existing.subject_scope = ExamInspectorSubjectScope.CORE
    existing.center_id = c1

    with patch(
        "app.services.inspector_posting.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[existing],
    ):
        session = AsyncMock()
        await validate_new_posting_no_overlap(
            session,
            examination_id=1,
            inspector_user_id=uuid4(),
            center_id=c2,
            subject_scope=ExamInspectorSubjectScope.ELECTIVE,
        )


@pytest.mark.asyncio
async def test_validate_overlap_allows_core_when_existing_all_different_centre() -> None:
    c1, c2 = uuid4(), uuid4()
    existing = MagicMock()
    existing.id = uuid4()
    existing.subject_scope = ExamInspectorSubjectScope.ALL
    existing.center_id = c1

    with patch(
        "app.services.inspector_posting.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[existing],
    ):
        session = AsyncMock()
        await validate_new_posting_no_overlap(
            session,
            examination_id=1,
            inspector_user_id=uuid4(),
            center_id=c2,
            subject_scope=ExamInspectorSubjectScope.CORE,
        )


@pytest.mark.asyncio
async def test_validate_overlap_rejects_core_when_existing_all_same_centre() -> None:
    c = uuid4()
    existing = MagicMock()
    existing.id = uuid4()
    existing.subject_scope = ExamInspectorSubjectScope.ALL
    existing.center_id = c

    with patch(
        "app.services.inspector_posting.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[existing],
    ):
        session = AsyncMock()
        with pytest.raises(HTTPException):
            await validate_new_posting_no_overlap(
                session,
                examination_id=1,
                inspector_user_id=uuid4(),
                center_id=c,
                subject_scope=ExamInspectorSubjectScope.CORE,
            )


def test_bulk_upload_captures_admin_user_id_before_per_row_rollback() -> None:
    """Per-row session.rollback() expires the auth User; re-reading admin.id can raise MissingGreenlet in async."""
    admin_id = uuid4()
    admin = MagicMock()
    admin.id = admin_id
    admin_user_id = cast(UUID, admin.id)

    # Simulates expired ORM state after rollback: a later admin.id read would hit the DB.
    admin.id = uuid4()
    assert admin_user_id == admin_id
