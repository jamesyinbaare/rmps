"""Subject officer marking-script-source route access tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import UserRole
from app.routers.subject_officer_marking_script_source import (
    get_subject_officer_marking_script_source,
    upsert_subject_officer_manual_marked_scripts,
)
from app.schemas.examination_marking_script_source import (
    ManualMarkedScriptsUpsertRequest,
    MarkingScriptSourceResponse,
)


@pytest.mark.asyncio
async def test_so_get_marking_script_source_checks_subject_access() -> None:
    session = AsyncMock()
    user = MagicMock(role=UserRole.SUBJECT_OFFICER, id=uuid4())
    expected = MarkingScriptSourceResponse(
        examination_id=1,
        subject_id=42,
        source_mode="allocation",
        available_papers=[1],
        paper_number=1,
        examiners=[],
    )

    with (
        patch(
            "app.routers.subject_officer_marking_script_source.assert_examination_subject",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ),
        patch(
            "app.routers.subject_officer_marking_script_source.assert_subject_officer_access",
            new=AsyncMock(),
        ) as mock_access,
        patch(
            "app.routers.subject_officer_marking_script_source.build_marking_script_source_response",
            new=AsyncMock(return_value=expected),
        ) as mock_build,
    ):
        result = await get_subject_officer_marking_script_source(
            examination_id=1,
            subject_id=42,
            session=session,
            user=user,
            paper=1,
        )

    mock_access.assert_awaited_once_with(session, user, 1, 42)
    mock_build.assert_awaited_once()
    assert result.subject_id == 42


@pytest.mark.asyncio
async def test_so_get_marking_script_source_denies_unassigned_subject() -> None:
    session = AsyncMock()
    user = MagicMock(role=UserRole.SUBJECT_OFFICER, id=uuid4())

    with (
        patch(
            "app.routers.subject_officer_marking_script_source.assert_examination_subject",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ),
        patch(
            "app.routers.subject_officer_marking_script_source.assert_subject_officer_access",
            new=AsyncMock(side_effect=HTTPException(status_code=403, detail="Not assigned to this subject")),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await get_subject_officer_marking_script_source(
                examination_id=1,
                subject_id=99,
                session=session,
                user=user,
                paper=None,
            )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_so_upsert_manual_marked_scripts_checks_access() -> None:
    session = AsyncMock()
    user = MagicMock(role=UserRole.SUBJECT_OFFICER, id=uuid4())
    examiner_id = uuid4()
    expected = MarkingScriptSourceResponse(
        examination_id=1,
        subject_id=42,
        source_mode="manual",
        available_papers=[1],
        paper_number=1,
        examiners=[],
    )
    examiner = MagicMock(id=examiner_id)
    body = ManualMarkedScriptsUpsertRequest(
        items=[{"examiner_id": examiner_id, "paper_number": 1, "script_count": 12}],
    )

    with (
        patch(
            "app.routers.subject_officer_marking_script_source.assert_examination_subject",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ),
        patch(
            "app.routers.subject_officer_marking_script_source.assert_subject_officer_access",
            new=AsyncMock(),
        ) as mock_access,
        patch(
            "app.routers.subject_officer_marking_script_source.load_examiners_on_subject",
            new=AsyncMock(return_value=[examiner]),
        ),
        patch(
            "app.routers.subject_officer_marking_script_source.upsert_manual_marked_scripts",
            new=AsyncMock(),
        ) as mock_upsert,
        patch(
            "app.routers.subject_officer_marking_script_source.build_marking_script_source_response",
            new=AsyncMock(return_value=expected),
        ),
    ):
        result = await upsert_subject_officer_manual_marked_scripts(
            examination_id=1,
            subject_id=42,
            body=body,
            session=session,
            user=user,
            paper=1,
        )

    mock_access.assert_awaited_once_with(session, user, 1, 42)
    mock_upsert.assert_awaited_once()
    session.commit.assert_awaited_once()
    assert result.source_mode == "manual"
