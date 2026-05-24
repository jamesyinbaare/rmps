"""Inspector workspace resolution (postings required; JWT posting hint)."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import ExamInspectorSubjectScope, UserRole
from app.services.inspector_posting import resolve_inspector_workspace


@pytest.mark.asyncio
async def test_resolve_workspace_forbids_when_no_postings() -> None:
    user = MagicMock()
    user.id = uuid4()
    user.role = UserRole.INSPECTOR

    with patch(
        "app.services.inspector_posting.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[],
    ):
        session = AsyncMock()
        with pytest.raises(HTTPException) as ei:
            await resolve_inspector_workspace(
                session,
                examination_id=1,
                user=user,
                posting_id=None,
                jwt_posting_id=None,
            )
        assert ei.value.status_code == 403


@pytest.mark.asyncio
async def test_resolve_workspace_uses_jwt_posting_when_matches_exam() -> None:
    user = MagicMock()
    uid = uuid4()
    user.id = uid
    user.role = UserRole.INSPECTOR

    center_id = uuid4()
    posting = MagicMock()
    posting.id = uuid4()
    posting.inspector_user_id = uid
    posting.examination_id = 5
    posting.examination_centre_id = center_id
    posting.subject_scope = ExamInspectorSubjectScope.CORE

    async def mock_get(_model, pid):
        return posting if pid == posting.id else None

    p1 = MagicMock()
    p1.id = posting.id
    p1.subject_scope = ExamInspectorSubjectScope.CORE
    p1.examination_centre_id = center_id

    centre = MagicMock()
    centre.id = center_id

    with patch(
        "app.services.inspector_posting.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[p1],
    ), patch(
        "app.services.inspector_posting.assert_examination_centre",
        new_callable=AsyncMock,
        return_value=centre,
    ), patch(
        "app.services.inspector_posting.centre_scope_school_ids_for_inspector_scope",
        new_callable=AsyncMock,
        return_value={uuid4()},
    ):
        session = AsyncMock()
        session.get = AsyncMock(side_effect=mock_get)

        ctx = await resolve_inspector_workspace(
            session,
            examination_id=5,
            user=user,
            posting_id=None,
            jwt_posting_id=posting.id,
        )
        assert ctx.posting is not None
        assert ctx.subject_scope == ExamInspectorSubjectScope.CORE
