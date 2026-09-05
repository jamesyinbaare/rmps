"""Unit tests for subject score Excel import (CORE + ELECTIVE, Paper 1 / 2)."""

from __future__ import annotations

import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pandas as pd
import pytest

from app.models import SubjectScore
from app.services.score_import import (
    generate_missing_scores_import_template,
    generate_score_import_template,
    import_scores,
    is_skip_score_value,
    normalize_score_import_columns,
    paper_extraction_attr,
    paper_field_name,
    paper_score_is_missing,
    parse_score_import_file,
    validate_score_import_columns,
)
from app.services.score_import_pipeline import (
    ExamSubjectInfo,
    ExistingScoreInfo,
    ImportLookups,
    ReadyApplyRow,
    classify_import_rows,
    file_checksum,
)
from app.services.subject_upload import SubjectUploadParseError


def _xlsx_bytes(rows: list[dict]) -> bytes:
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    return buf.getvalue()


def _csv_bytes(rows: list[dict]) -> bytes:
    df = pd.DataFrame(rows)
    return df.to_csv(index=False).encode("utf-8")


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


def test_parse_rejects_legacy_xls() -> None:
    with pytest.raises(SubjectUploadParseError, match="Legacy .xls"):
        parse_score_import_file(b"not-a-real-xls", "scores.xls")


def test_parse_csv_preserves_leading_zeros() -> None:
    content = _csv_bytes(
        [{"index_number": "0123456789", "subject_code": "C30-1-01", "score": "12"}]
    )
    df = parse_score_import_file(content, "scores.csv")
    df = normalize_score_import_columns(df)
    assert str(df.iloc[0]["index_number"]) == "0123456789"


def test_file_checksum_stable() -> None:
    assert file_checksum(b"abc") == file_checksum(b"abc")
    assert file_checksum(b"abc") != file_checksum(b"abd")


def _lookups(
    *,
    index: str = "0123456789",
    subject_code: str = "C30-1-01",
    alt_code: str = "MATH",
    score_id: int | None = 1,
    obj_raw: str | None = "10",
    essay_raw: str | None = "20",
) -> ImportLookups:
    info = ExamSubjectInfo(id=100, obj_max_score=40.0, essay_max_score=60.0)
    return ImportLookups(
        subject_by_code={subject_code.upper(): info, alt_code.upper(): info},
        reg_by_index={index: 5},
        reg_by_stripped_index={(index.lstrip("0") or "0"): 5},
        sr_lookup={
            (5, 100): (
                50,
                ExistingScoreInfo(
                    score_id=score_id,
                    obj_raw_score=obj_raw,
                    essay_raw_score=essay_raw,
                    pract_raw_score=None,
                ),
            )
        },
    )


def test_classify_paper1_ready_and_total() -> None:
    lookups = _lookups()
    rows = [(2, "0123456789", "C30-1-01", "35")]
    result, ready = classify_import_rows(rows, lookups, test_type=1)
    assert result.successful == 1
    assert result.updated == 1
    assert len(ready) == 1
    assert ready[0].parsed_score == "35"
    assert ready[0].subject_score_id == 1
    # total = new obj 35 + existing essay 20
    assert ready[0].total_score == 55.0


def test_classify_paper2_ready() -> None:
    lookups = _lookups()
    rows = [(2, "0123456789", "MATH", "55")]
    result, ready = classify_import_rows(rows, lookups, test_type=2)
    assert result.successful == 1
    assert ready[0].parsed_score == "55"
    assert ready[0].total_score == 65.0  # 10 + 55


def test_classify_elective_and_unknown() -> None:
    lookups = _lookups(subject_code="E40-2-05", alt_code="ECON")
    ok, ready = classify_import_rows(
        [(2, "0123456789", "E40-2-05", "28")], lookups, test_type=1
    )
    assert ok.successful == 1
    assert ready[0].parsed_score == "28"

    bad, ready2 = classify_import_rows(
        [(2, "0123456789", "UNKNOWN-99", "12")], lookups, test_type=1
    )
    assert bad.failed == 1
    assert ready2 == []
    assert "not found" in bad.errors[0].message.lower()


def test_classify_blank_na_invalid_unknown_index() -> None:
    lookups = _lookups()
    rows = [
        (2, "0123456789", "C30-1-01", ""),
        (3, "0123456789", "C30-1-01", "N/A"),
        (4, "0123456789", "C30-1-01", "not-a-score"),
        (5, "9999999999", "C30-1-01", "11"),
        (6, "0123456789", "C30-1-01", "30"),
    ]
    result, ready = classify_import_rows(rows, lookups, test_type=1)
    assert result.skipped == 2
    assert result.failed == 2
    assert result.successful == 1
    assert len(ready) == 1
    assert ready[0].parsed_score == "30"
    assert len(result.errors) == 2


def test_classify_leading_zero_fallback() -> None:
    lookups = _lookups(index="0123456789")
    # Excel may strip leading zero
    result, ready = classify_import_rows(
        [(2, "123456789", "C30-1-01", "22")], lookups, test_type=1
    )
    assert result.successful == 1
    assert ready[0].parsed_score == "22"


def test_classify_insert_when_no_score_row() -> None:
    lookups = _lookups(score_id=None, obj_raw=None, essay_raw=None)
    result, ready = classify_import_rows(
        [(2, "0123456789", "C30-1-01", "15")], lookups, test_type=1
    )
    assert result.successful == 1
    assert ready[0].subject_score_id is None
    assert ready[0].total_score == 15.0


def _mock_result(*, scalar_one=None, scalars_all=None, rows=None):
    result = MagicMock()
    if scalar_one is not None:
        result.scalar_one_or_none.return_value = scalar_one
    if scalars_all is not None:
        scalars = MagicMock()
        scalars.all.return_value = scalars_all
        result.scalars.return_value = scalars
    if rows is not None:
        result.all.return_value = rows
    return result


@pytest.mark.asyncio
async def test_sync_row_limit_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.score_import_pipeline.LARGE_IMPORT_ROW_THRESHOLD", 1
    )
    exam = SimpleNamespace(id=1)
    session = AsyncMock()
    session.execute = AsyncMock(return_value=_mock_result(scalar_one=exam))
    content = _csv_bytes(
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
            filename="scores.csv",
            enforce_row_limit=True,
        )


@pytest.mark.asyncio
async def test_import_dry_run_skips_apply(monkeypatch: pytest.MonkeyPatch) -> None:
    exam = SimpleNamespace(id=1)
    session = AsyncMock()
    session.execute = AsyncMock(return_value=_mock_result(scalar_one=exam))
    session.commit = AsyncMock()

    lookups = _lookups()
    monkeypatch.setattr(
        "app.services.score_import_pipeline.load_import_lookups",
        AsyncMock(return_value=lookups),
    )
    apply_mock = AsyncMock()
    monkeypatch.setattr(
        "app.services.score_import_pipeline.apply_ready_rows_via_staging",
        apply_mock,
    )
    cleanup_mock = AsyncMock()
    monkeypatch.setattr(
        "app.services.score_import_pipeline.cleanup_staging",
        cleanup_mock,
    )

    content = _csv_bytes(
        [{"index_number": "0123456789", "subject_code": "C30-1-01", "score": "33"}]
    )
    result = await import_scores(
        session,
        exam_id=1,
        test_type=1,
        file_content=content,
        filename="scores.csv",
        enforce_row_limit=False,
        dry_run=True,
    )
    assert result.successful == 1
    assert result.dry_run is True
    apply_mock.assert_not_awaited()
    cleanup_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_import_calls_apply_with_ready_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    exam = SimpleNamespace(id=1)
    session = AsyncMock()
    session.execute = AsyncMock(return_value=_mock_result(scalar_one=exam))
    session.commit = AsyncMock()

    lookups = _lookups()
    monkeypatch.setattr(
        "app.services.score_import_pipeline.load_import_lookups",
        AsyncMock(return_value=lookups),
    )
    applied: list[list[ReadyApplyRow]] = []

    async def _apply(session, **kwargs):
        applied.append(kwargs["ready"])

    monkeypatch.setattr(
        "app.services.score_import_pipeline.apply_ready_rows_via_staging",
        AsyncMock(side_effect=_apply),
    )
    monkeypatch.setattr(
        "app.services.score_import_pipeline.cleanup_staging",
        AsyncMock(),
    )

    content = _xlsx_bytes(
        [{"index_number": "0123456789", "subject_code": "C30-1-01", "score": "33"}]
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
    assert len(applied) == 1
    assert applied[0][0].parsed_score == "33"
    assert applied[0][0].total_score == 53.0  # 33 + essay 20


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
    lock_result.scalar.return_value = False

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
    assert session.execute.await_count == 4
    reset_call = session.execute.await_args_list[1]
    compiled = reset_call.args[0]
    where_sql = str(compiled.compile(compile_kwargs={"literal_binds": False}))
    assert "started_at" in where_sql.lower()
