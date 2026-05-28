"""Examination centre bulk upload validation and apply logic."""

from __future__ import annotations

import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pandas as pd
import pytest

from app.models import (
    CentreStructureMode,
    ExaminationCentreMembershipScope,
    Region,
    Zone,
)
from app.services.examination_centre_bulk_upload import (
    CentreBulkUploadParseError,
    apply_centre_bulk_upload,
    centre_fields_from_school,
    parse_centre_bulk_upload_file,
    validate_centre_bulk_columns,
    validate_upload_scope_for_exam,
)
from app.services.template_generator import generate_examination_centres_bulk_template


def _school(code: str, name: str | None = None):
    return SimpleNamespace(
        id=uuid4(),
        code=code,
        name=name or f"School {code}",
        region=Region.GREATER_ACCRA,
        zone=Zone.A,
    )


def test_validate_centre_bulk_columns_missing() -> None:
    df = pd.DataFrame([{"centre_code": "H001"}])
    with pytest.raises(CentreBulkUploadParseError, match="Missing required"):
        validate_centre_bulk_columns(df)


def test_validate_centre_bulk_columns_disallowed() -> None:
    df = pd.DataFrame([{"centre_code": "H001", "school_code": "H001", "region": "X"}])
    with pytest.raises(CentreBulkUploadParseError, match="unsupported columns"):
        validate_centre_bulk_columns(df)


def test_validate_upload_scope_unified() -> None:
    with pytest.raises(ValueError, match="UNIFIED"):
        validate_upload_scope_for_exam(
            CentreStructureMode.UNIFIED,
            ExaminationCentreMembershipScope.CORE,
        )


def test_validate_upload_scope_split_all() -> None:
    with pytest.raises(ValueError, match="SPLIT"):
        validate_upload_scope_for_exam(
            CentreStructureMode.SPLIT,
            ExaminationCentreMembershipScope.ALL,
        )


def test_centre_fields_from_school() -> None:
    sch = _school("H001", "Host High")
    fields = centre_fields_from_school(sch)
    assert fields["code"] == "H001"
    assert fields["name"] == "Host High"
    assert fields["region"] == Region.GREATER_ACCRA
    assert fields["zone"] == Zone.A


def test_parse_centre_bulk_upload_file_xlsx() -> None:
    body = generate_examination_centres_bulk_template("CORE")
    df = parse_centre_bulk_upload_file(body, "centres.xlsx")
    assert list(df.columns) == ["centre_code", "school_code"]
    assert len(df) >= 1


@pytest.mark.asyncio
async def test_apply_unknown_centre_code_row_error() -> None:
    exam = SimpleNamespace(id=1, centre_structure_mode=CentreStructureMode.SPLIT)
    session = AsyncMock()
    session.get = AsyncMock(return_value=exam)

    empty_result = MagicMock()
    empty_result.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(return_value=empty_result)
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()

    df = pd.DataFrame([{"centre_code": "NOPE", "school_code": "NOPE"}])
    res = await apply_centre_bulk_upload(session, 1, ExaminationCentreMembershipScope.CORE, df)

    assert res.failed == 1
    assert res.centres_created == 0
    assert "NOPE" in res.errors[0].error_message
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_apply_creates_centre_from_host_school() -> None:
    host = _school("H001")
    exam = SimpleNamespace(id=1, centre_structure_mode=CentreStructureMode.SPLIT)
    session = AsyncMock()
    session.get = AsyncMock(return_value=exam)

    call_count = 0

    async def fake_execute(stmt):
        nonlocal call_count
        call_count += 1
        result = MagicMock()
        if call_count == 4:
            result.scalars.return_value.all.return_value = [host]
        else:
            result.scalars.return_value.all.return_value = []
        return result

    session.execute = fake_execute
    added: list = []

    def capture_add(obj):
        added.append(obj)
        if hasattr(obj, "id") and obj.id is None:
            obj.id = uuid4()

    session.add = capture_add
    session.flush = AsyncMock()
    session.commit = AsyncMock()

    df = pd.DataFrame([{"centre_code": "H001", "school_code": "H001"}])
    res = await apply_centre_bulk_upload(session, 1, ExaminationCentreMembershipScope.CORE, df)

    assert res.centres_created == 1
    assert res.failed == 0
    assert res.memberships_added >= 1
    centre_objs = [o for o in added if getattr(o, "code", None) == "H001"]
    assert len(centre_objs) == 1
    assert centre_objs[0].name == host.name


@pytest.mark.asyncio
async def test_apply_unified_rejects_core_scope() -> None:
    exam = SimpleNamespace(id=1, centre_structure_mode=CentreStructureMode.UNIFIED)
    session = AsyncMock()
    session.get = AsyncMock(return_value=exam)

    df = pd.DataFrame([{"centre_code": "H001", "school_code": "H001"}])
    with pytest.raises(ValueError, match="UNIFIED"):
        await apply_centre_bulk_upload(session, 1, ExaminationCentreMembershipScope.CORE, df)


def test_template_generator_bytes() -> None:
    body = generate_examination_centres_bulk_template("ELECTIVE")
    assert len(body) > 100
    df = pd.read_excel(io.BytesIO(body))
    assert "centre_code" in [c.lower() for c in df.columns] or "centre_code" in df.columns
