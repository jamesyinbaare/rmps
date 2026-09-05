"""Unit tests for subject score Excel import (CORE + ELECTIVE, Paper 1 / 2)."""

from __future__ import annotations

import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pandas as pd
import pytest

from app.models import DataExtractionMethod, SubjectScore
from app.services.score_import import (
    generate_missing_scores_import_template,
    generate_score_import_template,
    import_scores,
    is_skip_score_value,
    normalize_score_import_columns,
    paper_extraction_attr,
    paper_field_name,
    paper_score_is_missing,
    validate_score_import_columns,
)


def _xlsx_bytes(rows: list[dict]) -> bytes:
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return buf.getvalue()


def test_paper_field_mapping() -> None:
    assert paper_field_name(1) == "obj_raw_score"
    assert paper_field_name(2) == "essay_raw_score"
    assert paper_extraction_attr(1) == "obj_extraction_method"
    assert paper_extraction_attr(2) == "essay_extraction_method"


def test_skip_score_values() -> None:
    assert is_skip_score_value(None) is True
    assert is_skip_score_value("") is True
    assert is_skip_score_value("N/A") is True
    assert is_skip_score_value("na") is True
    assert is_skip_score_value("n/a") is True
    assert is_skip_score_value("12") is False
    assert is_skip_score_value("A") is False


def test_paper_score_is_missing() -> None:
    assert paper_score_is_missing(None, 1) is True
    score = SubjectScore(
        id=1,
        subject_registration_id=1,
        obj_raw_score=None,
        essay_raw_score="20",
        pract_raw_score=None,
        total_score=0.0,
    )
    assert paper_score_is_missing(score, 1) is True
    assert paper_score_is_missing(score, 2) is False
    score.obj_raw_score = "  "
    assert paper_score_is_missing(score, 1) is True


def test_normalize_and_validate_columns() -> None:
    df = pd.DataFrame(
        {
            "Index Number": ["001"],
            "Original Code": ["C30"],
            "Mark": ["12"],
            "Subject Name": ["Math"],
        }
    )
    normalized = normalize_score_import_columns(df)
    validate_score_import_columns(normalized)
    assert list(normalized.columns) == [
        "index_number",
        "subject_code",
        "score",
        "subject_name",
    ]

    with pytest.raises(ValueError, match="Missing required"):
        validate_score_import_columns(pd.DataFrame({"index_number": ["1"]}))


def _mock_result(*, scalar_one=None, scalars_all=None):
    result = MagicMock()
    if scalar_one is not None:
        result.scalar_one_or_none.return_value = scalar_one
    if scalars_all is not None:
        scalars = MagicMock()
        scalars.all.return_value = scalars_all
        result.scalars.return_value = scalars
    return result


def _build_session(*, exam_subjects, registrations):
    exam = SimpleNamespace(id=1, year=2026, series=SimpleNamespace(value="MAY"))
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()

    # execute order in import_scores: exam → exam_subjects → registrations
    session.execute = AsyncMock(
        side_effect=[
            _mock_result(scalar_one=exam),
            _mock_result(scalars_all=exam_subjects),
            _mock_result(scalars_all=registrations),
        ]
    )
    return session


def _subject_fixture(
    *,
    subject_id: int = 10,
    exam_subject_id: int = 100,
    original_code: str = "C30-1-01",
    code: str = "MATH",
    name: str = "Mathematics",
    obj_raw: str | None = "10",
    essay_raw: str | None = "20",
):
    subject = SimpleNamespace(
        id=subject_id,
        original_code=original_code,
        code=code,
        name=name,
    )
    exam_subject = SimpleNamespace(
        id=exam_subject_id,
        subject_id=subject_id,
        subject=subject,
        obj_max_score=40.0,
        essay_max_score=60.0,
    )
    score = SubjectScore(
        id=1,
        subject_registration_id=50,
        obj_raw_score=obj_raw,
        essay_raw_score=essay_raw,
        pract_raw_score=None,
        total_score=0.0,
    )
    subject_reg = SimpleNamespace(
        id=50,
        exam_subject_id=exam_subject_id,
        subject_score=score,
    )
    exam_reg = SimpleNamespace(
        id=5,
        index_number="0123456789",
        subject_registrations=[subject_reg],
    )
    return exam_subject, exam_reg, score


@pytest.mark.asyncio
async def test_paper1_updates_only_obj_raw_score() -> None:
    exam_subject, exam_reg, score = _subject_fixture()
    session = _build_session(exam_subjects=[exam_subject], registrations=[exam_reg])
    content = _xlsx_bytes(
        [
            {
                "index_number": "0123456789",
                "subject_code": "C30-1-01",
                "score": "35",
            }
        ]
    )

    result = await import_scores(
        session,
        exam_id=1,
        test_type=1,
        file_content=content,
        filename="scores.xlsx",
    )

    assert result.successful == 1
    assert result.updated == 1
    assert score.obj_raw_score == "35"
    assert score.essay_raw_score == "20"
    assert score.obj_extraction_method == DataExtractionMethod.MANUAL_ENTRY_PHYSICAL
    assert score.essay_extraction_method is None


@pytest.mark.asyncio
async def test_paper2_updates_only_essay_raw_score() -> None:
    exam_subject, exam_reg, score = _subject_fixture()
    session = _build_session(exam_subjects=[exam_subject], registrations=[exam_reg])
    content = _xlsx_bytes(
        [
            {
                "index_number": "0123456789",
                "subject_code": "MATH",
                "score": "55",
            }
        ]
    )

    result = await import_scores(
        session,
        exam_id=1,
        test_type=2,
        file_content=content,
        filename="scores.xlsx",
    )

    assert result.successful == 1
    assert score.essay_raw_score == "55"
    assert score.obj_raw_score == "10"
    assert score.essay_extraction_method == DataExtractionMethod.MANUAL_ENTRY_PHYSICAL


@pytest.mark.asyncio
async def test_elective_subject_updates() -> None:
    exam_subject, exam_reg, score = _subject_fixture(
        original_code="E40-2-05",
        code="ECON",
        name="Economics",
    )
    session = _build_session(exam_subjects=[exam_subject], registrations=[exam_reg])
    content = _xlsx_bytes(
        [
            {
                "index_number": "0123456789",
                "subject_code": "E40-2-05",
                "score": "28",
            }
        ]
    )

    result = await import_scores(
        session,
        exam_id=1,
        test_type=1,
        file_content=content,
        filename="scores.xlsx",
    )

    assert result.successful == 1
    assert score.obj_raw_score == "28"


@pytest.mark.asyncio
async def test_rejects_unknown_subject_code() -> None:
    exam_subject, exam_reg, score = _subject_fixture()
    session = _build_session(exam_subjects=[exam_subject], registrations=[exam_reg])
    content = _xlsx_bytes(
        [
            {
                "index_number": "0123456789",
                "subject_code": "UNKNOWN-99",
                "score": "12",
            }
        ]
    )

    result = await import_scores(
        session,
        exam_id=1,
        test_type=1,
        file_content=content,
        filename="scores.xlsx",
    )

    assert result.successful == 0
    assert result.failed == 1
    assert "not found" in result.errors[0].message.lower()
    assert score.obj_raw_score == "10"


@pytest.mark.asyncio
async def test_blank_and_na_skipped_invalid_and_unknown_are_row_errors() -> None:
    exam_subject, exam_reg, score = _subject_fixture()
    session = _build_session(exam_subjects=[exam_subject], registrations=[exam_reg])
    content = _xlsx_bytes(
        [
            {
                "index_number": "0123456789",
                "subject_code": "C30-1-01",
                "score": "",
            },
            {
                "index_number": "0123456789",
                "subject_code": "C30-1-01",
                "score": "N/A",
            },
            {
                "index_number": "0123456789",
                "subject_code": "C30-1-01",
                "score": "not-a-score",
            },
            {
                "index_number": "9999999999",
                "subject_code": "C30-1-01",
                "score": "11",
            },
            {
                "index_number": "0123456789",
                "subject_code": "C30-1-01",
                "score": "30",
            },
        ]
    )

    result = await import_scores(
        session,
        exam_id=1,
        test_type=1,
        file_content=content,
        filename="scores.xlsx",
    )

    assert result.skipped == 2
    assert result.failed == 2
    assert result.successful == 1
    assert result.updated == 1
    assert score.obj_raw_score == "30"
    assert len(result.errors) == 2


@pytest.mark.asyncio
async def test_sync_row_limit_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.score_import.LARGE_IMPORT_ROW_THRESHOLD", 1)
    exam_subject, exam_reg, _score = _subject_fixture()
    session = _build_session(exam_subjects=[exam_subject], registrations=[exam_reg])
    content = _xlsx_bytes(
        [
            {"index_number": "0123456789", "subject_code": "C30-1-01", "score": "1"},
            {"index_number": "0123456789", "subject_code": "C30-1-01", "score": "2"},
        ]
    )
    with pytest.raises(ValueError, match="maximum for synchronous"):
        await import_scores(
            session,
            exam_id=1,
            test_type=1,
            file_content=content,
            filename="scores.xlsx",
            enforce_row_limit=True,
        )


@pytest.mark.asyncio
async def test_large_import_allowed_when_limit_disabled() -> None:
    exam_subject, exam_reg, score = _subject_fixture()
    session = _build_session(exam_subjects=[exam_subject], registrations=[exam_reg])
    content = _xlsx_bytes(
        [
            {
                "index_number": "0123456789",
                "subject_code": "C30-1-01",
                "score": "33",
            }
        ]
    )
    result = await import_scores(
        session,
        exam_id=1,
        test_type=1,
        file_content=content,
        filename="scores.xlsx",
        enforce_row_limit=False,
    )
    assert result.successful == 1
    assert score.obj_raw_score == "33"


@pytest.mark.asyncio
async def test_format_template_is_example_only() -> None:
    session = AsyncMock()
    session.execute = AsyncMock()
    content, filename = await generate_score_import_template(session, test_type=1)
    assert "format" in filename.lower()
    df = pd.read_excel(io.BytesIO(content), dtype=str, keep_default_na=False, engine="openpyxl")
    assert list(df.columns) == ["index_number", "subject_code", "subject_name", "score"]
    assert len(df) == 2
    assert "N/A" in set(df["score"].astype(str).str.strip().tolist())
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_missing_template_includes_only_missing_rows() -> None:
    exam = SimpleNamespace(id=1, year=2026, series=SimpleNamespace(value="MAY"))
    subject = SimpleNamespace(
        id=10,
        original_code="C30-1-01",
        code="MATH",
        name="Mathematics",
    )
    exam_subject = SimpleNamespace(
        id=100,
        subject_id=10,
        subject=subject,
        obj_max_score=40.0,
        essay_max_score=60.0,
    )

    missing_score = SubjectScore(
        id=1,
        subject_registration_id=1,
        obj_raw_score=None,
        essay_raw_score="20",
        pract_raw_score=None,
        total_score=0.0,
    )
    entered_score = SubjectScore(
        id=2,
        subject_registration_id=2,
        obj_raw_score="15",
        essay_raw_score="20",
        pract_raw_score=None,
        total_score=0.0,
    )
    regs = [
        SimpleNamespace(
            id=1,
            exam_subject_id=100,
            subject_score=missing_score,
            exam_registration=SimpleNamespace(index_number="1111111111"),
        ),
        SimpleNamespace(
            id=2,
            exam_subject_id=100,
            subject_score=entered_score,
            exam_registration=SimpleNamespace(index_number="2222222222"),
        ),
    ]

    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[
            _mock_result(scalar_one=exam),
            _mock_result(scalar_one=subject),
            _mock_result(scalar_one=exam_subject),
            _mock_result(scalars_all=regs),
        ]
    )

    content, filename = await generate_missing_scores_import_template(
        session,
        exam_id=1,
        test_type=1,
        subject_id=10,
    )
    assert "missing" in filename.lower()
    df = pd.read_excel(io.BytesIO(content), dtype=str, engine="openpyxl")
    assert len(df) == 1
    assert str(df.iloc[0]["index_number"]) == "1111111111"
    assert pd.isna(df.iloc[0]["score"]) or str(df.iloc[0]["score"]).strip() in ("", "nan")


def test_is_stale_in_progress_null_and_age() -> None:
    from datetime import datetime, timedelta

    from app.services.score_import import STALE_IMPORT_IN_PROGRESS_SECONDS, is_stale_in_progress

    now = datetime(2026, 9, 5, 12, 0, 0)
    assert is_stale_in_progress(None, now=now) is True
    fresh = now - timedelta(seconds=30)
    assert is_stale_in_progress(fresh, now=now) is False
    stale = now - timedelta(seconds=STALE_IMPORT_IN_PROGRESS_SECONDS + 1)
    assert is_stale_in_progress(stale, now=now) is True
    assert (
        is_stale_in_progress(
            now - timedelta(seconds=60),
            now=now,
            stale_after_seconds=60,
        )
        is True
    )


@pytest.mark.asyncio
async def test_resume_skips_when_advisory_lock_held(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import score_import as score_import_mod

    lock_result = MagicMock()
    lock_result.scalar.return_value = False  # another worker holds the lock

    session = AsyncMock()
    session.execute = AsyncMock(return_value=lock_result)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)

    sessionmanager = MagicMock()
    sessionmanager.session.return_value = session
    monkeypatch.setattr(
        "app.dependencies.database.get_sessionmanager",
        lambda: sessionmanager,
    )
    started: list[int] = []
    monkeypatch.setattr(score_import_mod, "start_score_import_job", started.append)

    count = await score_import_mod.resume_interrupted_score_import_jobs()
    assert count == 0
    assert started == []
    # Only the try-lock query; no unlock / reset when lock not acquired
    assert session.execute.await_count == 1


@pytest.mark.asyncio
async def test_resume_resets_only_stale_and_starts_pending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import score_import as score_import_mod

    lock_ok = MagicMock()
    lock_ok.scalar.return_value = True
    unlock_ok = MagicMock()
    unlock_ok.scalar.return_value = True

    reset_result = MagicMock()
    reset_result.scalars.return_value.all.return_value = [101]
    pending_result = MagicMock()
    pending_result.scalars.return_value.all.return_value = [101, 102]

    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=[lock_ok, reset_result, pending_result, unlock_ok]
    )
    session.commit = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)

    sessionmanager = MagicMock()
    sessionmanager.session.return_value = session
    monkeypatch.setattr(
        "app.dependencies.database.get_sessionmanager",
        lambda: sessionmanager,
    )
    started: list[int] = []
    monkeypatch.setattr(score_import_mod, "start_score_import_job", started.append)

    count = await score_import_mod.resume_interrupted_score_import_jobs()
    assert count == 2
    assert started == [101, 102]
    # lock, reset update, pending select, unlock
    assert session.execute.await_count == 4
    reset_call = session.execute.await_args_list[1]
    compiled = reset_call.args[0]
    where_sql = str(compiled.compile(compile_kwargs={"literal_binds": False}))
    assert "started_at" in where_sql.lower()
