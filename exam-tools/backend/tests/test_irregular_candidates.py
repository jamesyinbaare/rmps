"""Irregular candidate validation, feature gate, and centre-ops inclusion helpers."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.irregular_candidate_files import (
    IrregularCandidateUploadError,
    irregular_candidate_normalized_extension,
)
from app.services.irregular_candidates import (
    assert_c702_c705_mutex,
    load_irregular_candidate,
    normalize_optional_ghanapost_gps,
    normalize_required_gender,
    normalize_required_phone,
    original_subject_code,
    parse_subject_ids_json,
)
from app.services.inspector_submission_settings import assert_irregular_candidates_enabled
from app.services.candidate_ops_queries import (
    candidate_counts_by_school,
    count_candidates_in_scope,
    get_candidate_schedule_codes_for_exam,
)


def test_irregular_candidate_image_extensions() -> None:
    assert irregular_candidate_normalized_extension("photo.JPG") == ".jpg"
    assert irregular_candidate_normalized_extension("voucher.webp") == ".webp"
    with pytest.raises(IrregularCandidateUploadError):
        irregular_candidate_normalized_extension("scan.pdf")


def test_irregular_candidate_files_persist_under_storage_base_dir(tmp_path, monkeypatch) -> None:
    from app.services import exam_documents, irregular_candidate_files as files

    documents = tmp_path / "documents"
    documents.mkdir()
    monkeypatch.setattr(exam_documents, "storage_base_dir", lambda: documents)
    monkeypatch.setattr(files, "storage_base_dir", lambda: documents)
    monkeypatch.setattr(files, "_uses_gcs", lambda: False)

    rel = files.write_irregular_candidate_upload(
        b"fake-image-bytes",
        42,
        kind="photograph",
        filename="photo.jpg",
    )
    assert rel.startswith("irregular-candidates/42/")
    assert (documents / rel).is_file()
    assert files.read_irregular_candidate_file_bytes(rel) == b"fake-image-bytes"

    # Legacy parent location still readable for older records.
    legacy_rel = "irregular-candidates/42/photograph-legacy.jpg"
    legacy_path = tmp_path / legacy_rel
    legacy_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_path.write_bytes(b"legacy-bytes")
    assert files.read_irregular_candidate_file_bytes(legacy_rel) == b"legacy-bytes"


def test_parse_subject_ids_json() -> None:
    assert parse_subject_ids_json("[1, 2, 2, 3]") == [1, 2, 3]
    with pytest.raises(HTTPException) as ei:
        parse_subject_ids_json("[]")
    assert ei.value.status_code == 400
    with pytest.raises(HTTPException):
        parse_subject_ids_json("not-json")


def test_assert_c702_c705_mutex_rejects_both() -> None:
    s702 = MagicMock(code="C702", original_code="C702")
    s705 = MagicMock(code="C705", original_code=None)
    with pytest.raises(HTTPException) as ei:
        assert_c702_c705_mutex([s702, s705])
    assert ei.value.status_code == 400
    assert "mutually exclusive" in str(ei.value.detail)


def test_assert_c702_c705_mutex_allows_one() -> None:
    s701 = MagicMock(code="C701", original_code="C701")
    s702 = MagicMock(code="C702", original_code="C702")
    assert_c702_c705_mutex([s701, s702])


def test_assert_c702_c705_mutex_matches_original_code() -> None:
    s702 = MagicMock(code="X702", original_code="C702")
    s705 = MagicMock(code="X705", original_code="C705")
    with pytest.raises(HTTPException):
        assert_c702_c705_mutex([s702, s705])


def test_generate_irregular_candidates_export_empty() -> None:
    from app.services.irregular_candidate_export import generate_irregular_candidates_export

    payload = generate_irregular_candidates_export([])
    assert payload[:2] == b"PK"


def test_generate_irregular_candidates_pdf_smoke() -> None:
    from io import BytesIO

    from PIL import Image

    from app.services.irregular_candidate_pdf import (
        generate_irregular_candidates_pdf,
        irregular_candidates_pdf_filename,
    )

    exam = MagicMock()
    exam.exam_type = "TVET"
    exam.exam_series = "May"
    exam.year = 2026

    jpeg_buf = BytesIO()
    Image.new("RGB", (40, 50), (200, 40, 40)).save(jpeg_buf, format="JPEG")
    jpeg_bytes = jpeg_buf.getvalue()

    row = MagicMock()
    row.id = 1
    row.first_name = "Ama"
    row.other_name = None
    row.last_name = "Mensah"
    row.gender = "Female"
    row.date_of_birth = None
    row.phone_number = "0551234567"
    row.guardian_name = None
    row.guardian_phone_number = None
    row.ghanapost_gps_address = None
    row.created_at = None
    row.updated_at = None
    row.photograph_stored_path = "irregular-candidates/1/photograph-test.jpg"
    row.voucher_stored_path = "irregular-candidates/1/voucher-test.jpg"
    row.examination_centre = MagicMock(code="C001", name="Centre One")
    row.school = MagicMock(code="S001", name="School One")
    row.programme = MagicMock(code="P001", name="Programme One")
    selection = MagicMock()
    selection.subject_code = "X701"
    selection.subject_name = "Subject"
    selection.subject = MagicMock(code="X701", original_code="C701")
    row.subject_selections = [selection]

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "app.services.irregular_candidate_pdf.read_irregular_candidate_file_bytes",
            lambda _path: jpeg_bytes,
        )
        payload = generate_irregular_candidates_pdf(exam, [row])

    assert payload.startswith(b"%PDF")
    assert payload.count(b"/Image") >= 2
    assert irregular_candidates_pdf_filename(exam).endswith(".pdf")


def test_build_irregular_candidates_pdf_zip_by_centre() -> None:
    from app.services.irregular_candidate_pdf import (
        build_irregular_candidates_pdf_zip,
        group_candidate_contexts_by_centre,
    )

    exam = MagicMock()
    exam.exam_type = "TVET"
    exam.exam_series = "May"
    exam.year = 2026

    candidates = [
        {
            "id": 1,
            "full_name": "A",
            "first_name": "A",
            "other_name": "",
            "last_name": "One",
            "gender": "Male",
            "date_of_birth": "",
            "phone_number": "",
            "guardian_name": "",
            "guardian_phone_number": "",
            "ghanapost_gps_address": "",
            "centre_code": "C002",
            "centre_name": "Centre Two",
            "school_code": "",
            "school_name": "",
            "programme_code": "",
            "programme_name": "",
            "subject_codes": "C701",
            "recorded_at": "",
            "updated_at": "",
            "photograph_base64": None,
            "voucher_base64": None,
        },
        {
            "id": 2,
            "full_name": "B",
            "first_name": "B",
            "other_name": "",
            "last_name": "Two",
            "gender": "Female",
            "date_of_birth": "",
            "phone_number": "",
            "guardian_name": "",
            "guardian_phone_number": "",
            "ghanapost_gps_address": "",
            "centre_code": "C001",
            "centre_name": "Centre One",
            "school_code": "",
            "school_name": "",
            "programme_code": "",
            "programme_name": "",
            "subject_codes": "C702",
            "recorded_at": "",
            "updated_at": "",
            "photograph_base64": None,
            "voucher_base64": None,
        },
    ]
    groups = group_candidate_contexts_by_centre(candidates)
    assert [g[0] for g in groups] == ["C001", "C002"]

    payload = build_irregular_candidates_pdf_zip(
        exam=exam,
        exam_label="TVET — May 2026",
        candidates=candidates,
    )
    assert payload[:2] == b"PK"


def test_original_subject_code_prefers_original() -> None:
    selection = MagicMock()
    selection.subject_code = "X701"
    selection.subject = MagicMock(code="X701", original_code="C701")
    assert original_subject_code(selection) == "C701"

    selection_no_original = MagicMock()
    selection_no_original.subject_code = "X702"
    selection_no_original.subject = MagicMock(code="X702", original_code=None)
    assert original_subject_code(selection_no_original) == "X702"

    selection_snapshot = MagicMock()
    selection_snapshot.subject_code = "C703"
    selection_snapshot.subject = None
    assert original_subject_code(selection_snapshot) == "C703"


def test_normalize_required_gender() -> None:
    assert normalize_required_gender("Male") == "Male"
    assert normalize_required_gender("female") == "Female"
    assert normalize_required_gender("M") == "Male"
    with pytest.raises(HTTPException) as missing:
        normalize_required_gender("")
    assert missing.value.status_code == 400
    with pytest.raises(HTTPException) as invalid:
        normalize_required_gender("Other")
    assert invalid.value.status_code == 400


def test_normalize_required_phone() -> None:
    assert normalize_required_phone("0551234567") == "0551234567"
    assert normalize_required_phone("233551234567") == "0551234567"
    with pytest.raises(HTTPException):
        normalize_required_phone("123")


def test_normalize_optional_ghanapost_gps() -> None:
    assert normalize_optional_ghanapost_gps(None) is None
    assert normalize_optional_ghanapost_gps("  ") is None
    assert normalize_optional_ghanapost_gps(" GA-123-4567 ") == "GA-123-4567"
    with pytest.raises(HTTPException):
        normalize_optional_ghanapost_gps("x" * 51)


@pytest.mark.asyncio
async def test_assert_irregular_candidates_enabled_blocks_when_off() -> None:
    from unittest.mock import patch

    settings = MagicMock(irregular_candidates_enabled=False)
    session = AsyncMock()
    with patch(
        "app.services.inspector_submission_settings.get_or_create_submission_settings",
        new_callable=AsyncMock,
        return_value=settings,
    ):
        with pytest.raises(HTTPException) as ei:
            await assert_irregular_candidates_enabled(session, 1)
        assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_load_irregular_candidate_scopes_by_centre_not_recorder() -> None:
    """Any inspector at the centre can load a candidate; access is centre-bound, not recorder-bound."""
    centre_id = uuid4()
    other_centre_id = uuid4()
    row = MagicMock()
    session = AsyncMock()

    class _ScalarResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    session.execute = AsyncMock(return_value=_ScalarResult(row))
    found = await load_irregular_candidate(
        session,
        examination_id=1,
        candidate_id=9,
        centre_id=centre_id,
    )
    assert found is row

    session.execute = AsyncMock(return_value=_ScalarResult(None))
    with pytest.raises(HTTPException) as ei:
        await load_irregular_candidate(
            session,
            examination_id=1,
            candidate_id=9,
            centre_id=other_centre_id,
        )
    assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_assert_irregular_candidates_enabled_allows_when_on() -> None:
    from unittest.mock import patch

    settings = MagicMock(irregular_candidates_enabled=True)
    session = AsyncMock()
    with patch(
        "app.services.inspector_submission_settings.get_or_create_submission_settings",
        new_callable=AsyncMock,
        return_value=settings,
    ):
        out = await assert_irregular_candidates_enabled(session, 1)
        assert out is settings


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalar_one(self):
        return self._rows[0] if not isinstance(self._rows[0], tuple) else self._rows[0][0]


@pytest.mark.asyncio
async def test_get_candidate_schedule_codes_unions_irregular() -> None:
    school_id = uuid4()
    session = AsyncMock()
    calls = {"n": 0}

    async def execute_by_call(_stmt):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Result([("C701",), ("C702",)])
        return _Result([("C705",), ("C702",)])

    session.execute = AsyncMock(side_effect=execute_by_call)
    codes = await get_candidate_schedule_codes_for_exam(session, 9, {school_id})
    assert codes == {"C701", "C702", "C705"}


@pytest.mark.asyncio
async def test_count_candidates_in_scope_sums_both_sources() -> None:
    school_id = uuid4()
    session = AsyncMock()
    calls = {"n": 0}

    async def execute_by_call(_stmt):
        calls["n"] += 1
        return _Result([10 if calls["n"] == 1 else 3])

    session.execute = AsyncMock(side_effect=execute_by_call)
    total = await count_candidates_in_scope(session, 1, {school_id})
    assert total == 13


@pytest.mark.asyncio
async def test_candidate_counts_by_school_merges() -> None:
    school_a = uuid4()
    school_b = uuid4()
    session = AsyncMock()
    calls = {"n": 0}

    async def execute_by_call(_stmt):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Result([(school_a, 5), (school_b, 2)])
        return _Result([(school_a, 1)])

    session.execute = AsyncMock(side_effect=execute_by_call)
    counts = await candidate_counts_by_school(session, 1, {school_a, school_b})
    assert counts[school_a] == 6
    assert counts[school_b] == 2
