"""Staff centre scope for SPLIT examinations (supervisor + inspector postings)."""

from datetime import date, time
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import (
    CentreStructureMode,
    ExamInspectorSubjectScope,
    ExaminationCentreMembershipScope,
    UserRole,
)
from app.routers.examinations import (
    _centre_scope_ids_for_staff_user,
    _dashboard_stats_scope_ids,
    _filter_schools_with_registered_candidates,
    _staff_centre_timetable_entries,
    _staff_scope_and_display_school,
    _supervisor_split_write_destinations,
)
from app.schemas.examination import StaffCandidateWriteDestination, TimetableEntry
from app.services.centre_resolution import school_code_matches_centre_code


def test_dashboard_stats_scope_satellite_supervisor_own_school_only() -> None:
    user = MagicMock()
    user.role = UserRole.SUPERVISOR
    school = MagicMock()
    school.id = uuid4()
    centre_scope = {school.id, uuid4()}
    assert (
        _dashboard_stats_scope_ids(user, school, centre_scope, is_centre_host=False)
        == {school.id}
    )


def test_dashboard_stats_scope_host_supervisor_uses_centre() -> None:
    user = MagicMock()
    user.role = UserRole.SUPERVISOR
    school = MagicMock()
    school.id = uuid4()
    centre_scope = {school.id, uuid4()}
    assert (
        _dashboard_stats_scope_ids(user, school, centre_scope, is_centre_host=True)
        == centre_scope
    )


def test_school_code_match_means_host() -> None:
    assert school_code_matches_centre_code("H001", "h001") is True
    assert school_code_matches_centre_code("SAT01", "H001") is False


def test_filter_schools_with_registered_candidates_excludes_zero_count() -> None:
    host_id = uuid4()
    satellite_id = uuid4()
    empty_id = uuid4()
    host = MagicMock(id=host_id, code="H001")
    satellite = MagicMock(id=satellite_id, code="SAT01")
    empty = MagicMock(id=empty_id, code="SAT02")
    cand_by_school = {host_id: 12, satellite_id: 3}
    filtered = _filter_schools_with_registered_candidates(
        [host, satellite, empty],
        cand_by_school,
    )
    assert [s.id for s in filtered] == [host_id, satellite_id]


@pytest.mark.asyncio
async def test_centre_scope_ids_inspector_with_posting_uses_workspace() -> None:
    user = MagicMock()
    user.id = uuid4()
    user.role = UserRole.INSPECTOR
    user_school = MagicMock()
    user_school.id = uuid4()
    exam_id = 1
    satellite_id = uuid4()
    workspace_ids = {user_school.id, satellite_id}

    ctx = MagicMock()
    ctx.scope_ids = workspace_ids

    with patch(
        "app.routers.examinations.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[MagicMock()],
    ), patch(
        "app.routers.examinations.resolve_inspector_workspace",
        new_callable=AsyncMock,
        return_value=ctx,
    ):
        session = AsyncMock()
        result = await _centre_scope_ids_for_staff_user(
            session, user, user_school, exam_id, jwt_inspector_posting_id=uuid4()
        )
    assert result == workspace_ids


@pytest.mark.asyncio
async def test_centre_scope_ids_supervisor_split_uses_member_scope() -> None:
    user = MagicMock()
    user.id = uuid4()
    user.role = UserRole.SUPERVISOR
    user_school = MagicMock()
    user_school.id = uuid4()
    user_school.code = "SAT01"
    exam_id = 1
    core_satellite = uuid4()
    core_scope = {user_school.id, core_satellite}
    center_host = MagicMock()
    centre = MagicMock()
    centre.code = "HOST01"

    with patch(
        "app.routers.examinations.inspector_scope_for_member_school",
        new_callable=AsyncMock,
        return_value=ExamInspectorSubjectScope.CORE,
    ), patch(
        "app.routers.examinations.resolve_centre_for_user_school",
        new_callable=AsyncMock,
        return_value=centre,
    ), patch(
        "app.routers.examinations.resolve_center_host_school",
        new_callable=AsyncMock,
        return_value=center_host,
    ), patch(
        "app.routers.examinations.center_scope_school_ids",
        new_callable=AsyncMock,
        return_value=core_scope,
    ) as mock_center_scope:
        session = AsyncMock()
        result = await _centre_scope_ids_for_staff_user(
            session, user, user_school, exam_id
        )

    assert result == core_scope
    mock_center_scope.assert_awaited_once()
    assert mock_center_scope.await_args.kwargs["inspector_scope"] == ExamInspectorSubjectScope.CORE


@pytest.mark.asyncio
async def test_staff_scope_preview_accepts_school_in_workspace_scope() -> None:
    """Regression: filter_school_id allowed when list and preview share workspace scope_ids."""
    user = MagicMock()
    user.id = uuid4()
    user.role = UserRole.INSPECTOR
    user_school = MagicMock()
    user_school.id = uuid4()
    exam_id = 1
    satellite_id = uuid4()
    workspace_ids = {user_school.id, satellite_id}

    ctx = MagicMock()
    ctx.scope_ids = workspace_ids
    ctx.examination_centre = MagicMock()
    display_school = MagicMock()
    display_school.id = satellite_id

    with patch(
        "app.routers.examinations._centre_scope_ids_for_staff_user",
        new_callable=AsyncMock,
        return_value=workspace_ids,
    ), patch(
        "app.routers.examinations.load_postings_for_inspector_exam",
        new_callable=AsyncMock,
        return_value=[MagicMock()],
    ), patch(
        "app.routers.examinations.resolve_inspector_workspace",
        new_callable=AsyncMock,
        return_value=ctx,
    ), patch(
        "app.routers.examinations.representative_school_for_centre",
        new_callable=AsyncMock,
        return_value=user_school,
    ):
        session = AsyncMock()
        session.get = AsyncMock(return_value=display_school)
        scope_ids, school = await _staff_scope_and_display_school(
            session,
            user,
            user_school,
            satellite_id,
            exam_id,
            jwt_inspector_posting_id=uuid4(),
        )

    assert scope_ids == workspace_ids
    assert school is display_school


@pytest.mark.asyncio
async def test_staff_scope_preview_rejects_school_outside_scope() -> None:
    user = MagicMock()
    user.id = uuid4()
    user.role = UserRole.SUPERVISOR
    user_school = MagicMock()
    user_school.id = uuid4()
    exam_id = 1
    outsider_id = uuid4()

    with patch(
        "app.routers.examinations._centre_scope_ids_for_staff_user",
        new_callable=AsyncMock,
        return_value={user_school.id},
    ):
        session = AsyncMock()
        with pytest.raises(HTTPException) as ei:
            await _staff_scope_and_display_school(
                session, user, user_school, outsider_id, exam_id
            )
    assert ei.value.status_code == 400
    assert "not in your examination centre scope" in str(ei.value.detail)


@pytest.mark.asyncio
async def test_supervisor_split_write_destinations_requires_multiple_centres() -> None:
    school_id = uuid4()
    centre_a = uuid4()
    centre_b = uuid4()
    exam = MagicMock()
    exam.id = 1
    exam.centre_structure_mode = CentreStructureMode.SPLIT
    per_scope = [
        StaffCandidateWriteDestination(
            subject_scope=ExaminationCentreMembershipScope.CORE.value,
            centre_id=centre_a,
            centre_code="HOST01",
            centre_name="Host Centre",
            centre_region="—",
        ),
        StaffCandidateWriteDestination(
            subject_scope=ExaminationCentreMembershipScope.ELECTIVE.value,
            centre_id=centre_b,
            centre_code="SAT01",
            centre_name="Satellite School",
            centre_region="—",
        ),
    ]
    with patch(
        "app.routers.examinations.list_candidate_write_destinations_per_scope_for_school",
        new_callable=AsyncMock,
        return_value=per_scope,
    ):
        result = await _supervisor_split_write_destinations(AsyncMock(), exam, school_id)
    assert result == per_scope


@pytest.mark.asyncio
async def test_staff_centre_timetable_entries_unions_split_supervisor_destinations() -> None:
    user = MagicMock()
    user.role = UserRole.SUPERVISOR
    user_school = MagicMock()
    user_school.id = uuid4()
    exam = MagicMock()
    exam.id = 1
    exam.centre_structure_mode = CentreStructureMode.SPLIT
    exam_centre = MagicMock()
    centre_a = uuid4()
    centre_b = uuid4()
    core_entry = TimetableEntry(
        examination_date=date(2026, 5, 10),
        examination_time=time(9, 0),
        subject_code="MATH",
        subject_name="Mathematics",
        paper=1,
    )
    elective_entry = TimetableEntry(
        examination_date=date(2026, 5, 12),
        examination_time=time(9, 0),
        subject_code="ART",
        subject_name="Art",
        paper=1,
    )
    split_destinations = [
        StaffCandidateWriteDestination(
            subject_scope=ExaminationCentreMembershipScope.CORE.value,
            centre_id=centre_a,
            centre_code="HOST01",
            centre_name="Host Centre",
            centre_region="—",
        ),
        StaffCandidateWriteDestination(
            subject_scope=ExaminationCentreMembershipScope.ELECTIVE.value,
            centre_id=centre_b,
            centre_code="SAT01",
            centre_name="Satellite School",
            centre_region="—",
        ),
    ]

    async def fake_filtered_entries(session, exam_id, scope_ids, **kwargs):
        if kwargs["exam_centre"].id == centre_a:
            return [core_entry]
        if kwargs["exam_centre"].id == centre_b:
            return [elective_entry]
        return []

    with patch(
        "app.routers.examinations._supervisor_split_write_destinations",
        new_callable=AsyncMock,
        return_value=split_destinations,
    ), patch(
        "app.routers.examinations.get_examination_centre_or_404",
        new_callable=AsyncMock,
        side_effect=lambda _session, _exam_id, centre_id: MagicMock(id=centre_id),
    ), patch(
        "app.routers.examinations._staff_center_filtered_timetable_entries",
        new_callable=AsyncMock,
        side_effect=fake_filtered_entries,
    ) as mock_filtered:
        entries = await _staff_centre_timetable_entries(
            AsyncMock(),
            exam,
            exam.id,
            user,
            user_school,
            scope_ids={user_school.id},
            exam_centre=exam_centre,
            workspace_centre=None,
            centre_inspector_scope=None,
            is_account_centre_host=False,
        )

    assert entries == [core_entry, elective_entry]
    assert mock_filtered.await_count == 2
