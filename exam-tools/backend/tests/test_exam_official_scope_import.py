"""Scope import helpers and import behaviour for exam centre officials."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import ExamCentreOfficial, ExamInspectorSubjectScope, ExamOfficialDesignation
from app.services.exam_official_scope_import import (
    build_import_preview_rows,
    destination_identity_keys,
    import_officials_from_source_scope,
    is_duplicate_in_destination,
    official_identity_key,
)
from app.services.subject_scope import opposite_record_scope


def _official(
    *,
    full_name: str = "Jane Doe",
    designation: ExamOfficialDesignation = ExamOfficialDesignation.INVIGILATOR,
    telephone: str = "0241234567",
    scope: ExamInspectorSubjectScope = ExamInspectorSubjectScope.CORE,
) -> ExamCentreOfficial:
    return ExamCentreOfficial(
        id=uuid4(),
        examination_id=1,
        examination_centre_id=uuid4(),
        full_name=full_name,
        designation=designation,
        bank_branch_id=uuid4(),
        account_number="1234567890123",
        num_days=3,
        telephone_number=telephone,
        subject_scope=scope,
    )


def test_opposite_record_scope() -> None:
    assert opposite_record_scope(ExamInspectorSubjectScope.CORE) == ExamInspectorSubjectScope.ELECTIVE
    assert opposite_record_scope(ExamInspectorSubjectScope.ELECTIVE) == ExamInspectorSubjectScope.CORE
    with pytest.raises(ValueError):
        opposite_record_scope(ExamInspectorSubjectScope.ALL)


def test_official_identity_key_casefolds_name() -> None:
    a = official_identity_key("Jane Doe", ExamOfficialDesignation.INVIGILATOR, "0241234567")
    b = official_identity_key("jane doe", ExamOfficialDesignation.INVIGILATOR, "0241234567")
    assert a == b


def test_is_duplicate_in_destination() -> None:
    dest = _official(full_name="Jane Doe", telephone="0241234567")
    src_match = _official(full_name="jane doe", telephone="0241234567")
    src_other = _official(full_name="Other Person", telephone="0249999999")
    keys = destination_identity_keys([dest])
    assert is_duplicate_in_destination(src_match, keys) is True
    assert is_duplicate_in_destination(src_other, keys) is False


def test_build_import_preview_rows() -> None:
    dest = _official(full_name="Existing", telephone="0241111111")
    src_dup = _official(full_name="Existing", telephone="0241111111", scope=ExamInspectorSubjectScope.ELECTIVE)
    src_new = _official(full_name="New Person", telephone="0242222222", scope=ExamInspectorSubjectScope.ELECTIVE)

    def to_resp(row: ExamCentreOfficial) -> dict:
        return {"id": str(row.id), "full_name": row.full_name}

    items = build_import_preview_rows([src_dup, src_new], [dest], to_response=to_resp)
    assert len(items) == 2
    assert items[0]["duplicate_in_destination"] is False
    assert items[0]["importable"] is True
    assert items[0]["source_official"]["full_name"] == "New Person"
    assert items[1]["duplicate_in_destination"] is True
    assert items[1]["importable"] is False
    assert items[1]["source_official"]["full_name"] == "Existing"


@pytest.mark.asyncio
async def test_import_rejects_invalid_source_ids() -> None:
    centre_id = uuid4()
    src = _official(scope=ExamInspectorSubjectScope.ELECTIVE)
    session = AsyncMock()

    with patch(
        "app.services.exam_official_scope_import.load_import_source_and_destination",
        new_callable=AsyncMock,
        return_value=(ExamInspectorSubjectScope.ELECTIVE, [src], []),
    ):
        with pytest.raises(HTTPException) as exc:
            await import_officials_from_source_scope(
                session,
                examination_id=1,
                examination_centre_id=centre_id,
                destination_scope=ExamInspectorSubjectScope.CORE,
                import_items=[(uuid4(), 1)],
            )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_import_skips_duplicates_and_creates_new() -> None:
    centre_id = uuid4()
    dest_existing = _official(full_name="Dup", telephone="0241111111")
    src_dup = _official(full_name="Dup", telephone="0241111111", scope=ExamInspectorSubjectScope.ELECTIVE)
    src_new = _official(full_name="Fresh", telephone="0242222222", scope=ExamInspectorSubjectScope.ELECTIVE)

    session = AsyncMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.flush = AsyncMock()

    execute_result = MagicMock()
    execute_result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=execute_result)

    with patch(
        "app.services.exam_official_scope_import.load_import_source_and_destination",
        new_callable=AsyncMock,
        return_value=(ExamInspectorSubjectScope.ELECTIVE, [src_dup, src_new], [dest_existing]),
    ):
        created, requested, skipped = await import_officials_from_source_scope(
            session,
            examination_id=1,
            examination_centre_id=centre_id,
            destination_scope=ExamInspectorSubjectScope.CORE,
            import_items=[(src_dup.id, 2), (src_new.id, 5)],
        )

    assert requested == 2
    assert skipped == 1
    assert session.add.call_count == 1
    added = session.add.call_args[0][0]
    assert added.full_name == "Fresh"
    assert added.num_days == 5
    assert added.subject_scope == ExamInspectorSubjectScope.CORE
