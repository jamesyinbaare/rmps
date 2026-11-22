"""Column-level checks for docs/samples/bulk_upload_error_demo.xlsx."""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from openpyxl import load_workbook

from app.models import RegistrationType, SubjectType
from app.routers.school import _parse_bulk_upload_file_to_rows
from app.services.bulk_candidate_upload import (
    normalize_ghana_phone,
    option_match_tokens,
    process_bulk_candidate_rows,
    subject_matches_option_tokens,
)

SAMPLE = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "samples"
    / "bulk_upload_error_demo.xlsx"
)


def test_option_and_phone_helpers():
    assert option_match_tokens("soc") == {"SOC", "C702", "702"}
    assert option_match_tokens("ENT") == {"ENT", "C705", "705"}
    assert option_match_tokens("FOO") is None
    assert normalize_ghana_phone("244123456") == "0244123456"
    assert normalize_ghana_phone("0244123456") == "0244123456"
    with pytest.raises(ValueError):
        normalize_ghana_phone("+233244000000")
    fake = SimpleNamespace(code="702", original_code="C702")
    assert subject_matches_option_tokens(fake, {"C702", "702", "SOC"})


def _expected_field(note: str) -> str | None:
    if not note.startswith("ERROR"):
        return None
    return note[len("ERROR ") :].split(":", 1)[0].strip()


@pytest.mark.asyncio
async def test_sample_excel_all_columns_dry_run():
    assert SAMPLE.is_file(), f"missing sample: {SAMPLE}"

    wb = load_workbook(SAMPLE)
    ws = wb.active
    headers = [c.value for c in ws[1]]
    note_idx = headers.index("_test_note") + 1
    notes_by_excel_row = {
        r: (ws.cell(r, note_idx).value or "") for r in range(2, ws.max_row + 1)
    }

    rows = _parse_bulk_upload_file_to_rows(SAMPLE.read_bytes(), SAMPLE.name)
    assert len(rows) == 100
    for r in rows[:3]:
        phone = str(r.get("contact_phone") or "")
        assert phone.startswith("0") and len(phone) == 10

    def make_subject(id_, code, original=None, stype=SubjectType.CORE):
        return SimpleNamespace(
            id=id_,
            code=code,
            original_code=original or code,
            name=f"Subject {code}",
            subject_type=stype,
        )

    soc = make_subject(702, "702", "C702")
    ent = make_subject(705, "705", "C705")
    core1 = make_subject(1, "C701", "C701")
    elec1 = make_subject(10, "E1", "E1", SubjectType.ELECTIVE)
    programmes = {
        "C301": SimpleNamespace(id=301, code="C301", name="Building Construction"),
        "C421": SimpleNamespace(id=421, code="C421", name="Electrical"),
        "C601": SimpleNamespace(id=601, code="C601", name="Catering"),
    }

    async def fake_get_subjects(session, programme_id):
        return {
            "compulsory_core": [core1.id],
            "optional_core_groups": {1: [soc.id, ent.id]},
            "electives": [elec1.id],
        }

    async def fake_validate(
        session, programme_id, selected, exam_series=None, registration_type=None
    ):
        need = {core1.id, elec1.id}
        selected_set = set(selected)
        if not need.issubset(selected_set):
            return False, ["missing cores/electives"]
        if not ({soc.id, ent.id} & selected_set):
            return False, ["missing option"]
        if {soc.id, ent.id}.issubset(selected_set):
            return False, ["both options"]
        return True, []

    class Result:
        def __init__(self, one=None, all_=None, first=None):
            self._one = one
            self._all = all_ or []
            self._first = first

        def scalar_one_or_none(self):
            return self._one

        def scalars(self):
            return SimpleNamespace(all=lambda: self._all)

        def first(self):
            return self._first

        def all(self):
            return self._all

    session = AsyncMock()
    session.rollback = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    async def smart_execute(stmt):
        s = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        sl = s.lower()
        if "school_programmes" in sl:
            return Result(first=(1,))
        if "from programmes" in sl or "from programme" in sl:
            for code, prog in programmes.items():
                if f"'{code}'" in s:
                    return Result(one=prog)
            return Result(one=None)
        if "original_code" in sl:
            for subj in (soc, ent, core1, elec1):
                if f"'{subj.original_code}'" in s:
                    return Result(one=subj)
            return Result(one=None)
        if "from subjects" in sl or "from subject" in sl:
            if " in (" in sl or " in(" in sl:
                return Result(all_=[soc, ent, core1, elec1])
            for subj in (soc, ent, core1, elec1):
                if f"'{subj.code}'" in s:
                    return Result(one=subj)
            return Result(one=None, all_=[])
        return Result(one=None, first=(1,), all_=[])

    session.execute = AsyncMock(side_effect=smart_execute)

    exam = SimpleNamespace(
        id=99, exam_kind="school", exam_series="MAY/JUNE", allows_bulk_registration=True
    )
    user = SimpleNamespace(id=1, school_id=10)

    with (
        patch(
            "app.services.bulk_candidate_upload.school_allows_free_tvet_for_exam",
            AsyncMock(return_value=False),
        ),
        patch(
            "app.services.bulk_candidate_upload.get_programme_subjects_for_registration",
            fake_get_subjects,
        ),
        patch(
            "app.services.bulk_candidate_upload.validate_subject_selections",
            fake_validate,
        ),
        patch(
            "app.services.bulk_candidate_upload.validate_registration_type_for_exam",
            lambda *a, **k: RegistrationType.FEE_PAYING.value,
        ),
        patch(
            "app.services.bulk_candidate_upload.is_private_exam",
            lambda *a, **k: False,
        ),
        patch(
            "app.services.bulk_candidate_upload.resolve_examination_center",
            AsyncMock(return_value=10),
        ),
        patch(
            "app.services.bulk_candidate_upload.generate_unique_registration_number",
            AsyncMock(return_value="REG001"),
        ),
    ):
        result = await process_bulk_candidate_rows(
            session,
            exam=exam,
            current_user=user,
            rows=rows,
            default_registration_type="fee_paying",
            commit=False,
            dry_run=True,
        )

    errors_by_row: dict[int, list] = {}
    for e in result.errors:
        errors_by_row.setdefault(e.row_number, []).append(e)

    assert result.successful == 80
    assert result.failed == 20

    failures = []
    for row in rows:
        rn = row["row_number"]
        note = notes_by_excel_row.get(rn, "")
        errs = errors_by_row.get(rn, [])
        fields = [e.field for e in errs]
        if note.startswith("VALID"):
            if any(e.field == "option" for e in errs):
                failures.append(f"row {rn}: valid option failed: {errs[0].error_message}")
            if errs:
                failures.append(f"row {rn}: VALID had errors {fields}")
        elif note.startswith("ERROR"):
            exp = _expected_field(note)
            if exp not in fields:
                failures.append(f"row {rn}: expected {exp}, got {fields} ({note})")

    assert not failures, "\\n".join(failures)
