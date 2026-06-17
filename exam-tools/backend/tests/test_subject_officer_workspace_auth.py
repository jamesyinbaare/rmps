"""Subject officer workspace JWT (select-workspace, login auto-select, /auth/me label)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.security import get_password_hash, verify_token
from app.models import Examination, Subject, SubjectOfficerAssignment, User, UserRole
from app.routers.auth import (
    SubjectOfficerSelectWorkspaceBody,
    SuperAdminLoginRequest,
    get_me,
    subject_officer_select_workspace,
    super_admin_login,
)


@pytest.mark.asyncio
async def test_staff_login_auto_selects_single_assignment() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.role = UserRole.SUBJECT_OFFICER
    user.email = "officer@example.com"
    user.is_active = True
    user.hashed_password = get_password_hash("CorrectPass1!")
    user.school_code = None

    assignment_id = uuid4()
    assignment = MagicMock(spec=SubjectOfficerAssignment)
    assignment.id = assignment_id

    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    session.execute = AsyncMock(return_value=result)

    async def fake_load_rows(_session, *, user_id):  # noqa: ANN001
        assert user_id == user.id
        return [assignment]

    from unittest.mock import patch

    with patch(
        "app.routers.auth.load_subject_officer_assignment_rows",
        new=AsyncMock(side_effect=fake_load_rows),
    ):
        response = await super_admin_login(
            SuperAdminLoginRequest(email="officer@example.com", password="CorrectPass1!"),
            session,
        )

    payload = verify_token(response.access_token)
    assert payload is not None
    assert payload.get("subject_officer_assignment_id") == str(assignment_id)


@pytest.mark.asyncio
async def test_staff_login_rejects_subject_officer_without_assignments() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.role = UserRole.SUBJECT_OFFICER
    user.email = "officer@example.com"
    user.is_active = True
    user.hashed_password = get_password_hash("CorrectPass1!")
    user.school_code = None

    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    session.execute = AsyncMock(return_value=result)

    from unittest.mock import patch

    with patch(
        "app.routers.auth.load_subject_officer_assignment_rows",
        new=AsyncMock(return_value=[]),
    ):
        with pytest.raises(HTTPException) as exc:
            await super_admin_login(
                SuperAdminLoginRequest(email="officer@example.com", password="CorrectPass1!"),
                session,
            )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_select_workspace_mints_token_for_valid_assignment() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.role = UserRole.SUBJECT_OFFICER

    assignment_id = uuid4()
    assignment = MagicMock(spec=SubjectOfficerAssignment)
    assignment.id = assignment_id
    assignment.user_id = user.id

    session.get = AsyncMock(return_value=assignment)
    user.email = "officer@example.com"

    response = await subject_officer_select_workspace(
        SubjectOfficerSelectWorkspaceBody(assignment_id=assignment_id),
        session,
        user,
    )
    payload = verify_token(response.access_token)
    assert payload is not None
    assert payload.get("subject_officer_assignment_id") == str(assignment_id)


@pytest.mark.asyncio
async def test_select_workspace_rejects_other_users_assignment() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.id = uuid4()

    assignment = MagicMock(spec=SubjectOfficerAssignment)
    assignment.id = uuid4()
    assignment.user_id = uuid4()

    session.get = AsyncMock(return_value=assignment)

    with pytest.raises(HTTPException) as exc:
        await subject_officer_select_workspace(
            SubjectOfficerSelectWorkspaceBody(assignment_id=assignment.id),
            session,
            user,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_me_includes_subject_officer_workspace_label() -> None:
    session = AsyncMock()
    user = MagicMock(spec=User)
    user.id = uuid4()
    user.role = UserRole.SUBJECT_OFFICER
    user.full_name = "Officer One"
    user.email = "officer@example.com"
    user.username = None
    user.school_code = None
    user.phone_number = None
    user.depot_id = None

    assignment_id = uuid4()

    async def fake_label(_session, *, assignment_id: object, user_id: object) -> str:
        assert user_id == user.id
        return "WASSCE 2026 · MATH — Mathematics"

    from unittest.mock import patch

    with patch(
        "app.routers.auth.resolve_subject_officer_workspace_label",
        new=AsyncMock(side_effect=fake_label),
    ):
        me = await get_me(session, user, None, assignment_id)

    assert me.subject_officer_workspace_label == "WASSCE 2026 · MATH — Mathematics"
