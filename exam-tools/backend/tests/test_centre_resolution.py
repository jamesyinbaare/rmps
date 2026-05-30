"""Centre scope mapping after UNIFIED → SPLIT upgrade."""

from types import SimpleNamespace

import pytest

from app.models import (
    CentreStructureMode,
    ExamInspectorSubjectScope,
    ExaminationCentreMembershipScope,
)
from app.services.centre_resolution import (
    consolidate_write_destinations_by_centre,
    inspector_scope_from_membership_scopes,
    membership_scope_for_inspector_scope,
    school_code_matches_centre_code,
    timetable_filters_for_memberships,
)
from app.schemas.timetable import TimetableDownloadFilter


def _exam(mode: CentreStructureMode) -> SimpleNamespace:
    return SimpleNamespace(centre_structure_mode=mode)


def test_school_code_matches_centre_code() -> None:
    assert school_code_matches_centre_code("abc01", "ABC01") is True
    assert school_code_matches_centre_code("abc01", "xyz99") is False


def test_consolidate_write_destinations_same_centre() -> None:
    from uuid import uuid4

    from app.schemas.examination import StaffCandidateWriteDestination
    from app.services.centre_resolution import consolidate_write_destinations_by_centre

    centre_id = uuid4()
    items = consolidate_write_destinations_by_centre(
        [
            StaffCandidateWriteDestination(
                subject_scope="CORE",
                centre_id=centre_id,
                centre_code="H001",
                centre_name="Host",
                centre_region="Ashanti",
            ),
            StaffCandidateWriteDestination(
                subject_scope="ELECTIVE",
                centre_id=centre_id,
                centre_code="H001",
                centre_name="Host",
                centre_region="Ashanti",
            ),
        ]
    )
    assert len(items) == 1
    assert items[0].subject_scope == "ALL"
    assert items[0].centre_code == "H001"


def test_consolidate_write_destinations_different_centres() -> None:
    from uuid import uuid4

    from app.schemas.examination import StaffCandidateWriteDestination
    from app.services.centre_resolution import consolidate_write_destinations_by_centre

    items = consolidate_write_destinations_by_centre(
        [
            StaffCandidateWriteDestination(
                subject_scope="CORE",
                centre_id=uuid4(),
                centre_code="H001",
                centre_name="Host One",
                centre_region="Ashanti",
            ),
            StaffCandidateWriteDestination(
                subject_scope="ELECTIVE",
                centre_id=uuid4(),
                centre_code="H002",
                centre_name="Host Two",
                centre_region="Greater Accra",
            ),
        ]
    )
    assert len(items) == 2
    assert {i.subject_scope for i in items} == {"CORE", "ELECTIVE"}


def test_membership_scope_unified_all() -> None:
    exam = _exam(CentreStructureMode.UNIFIED)
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.ALL)
        == ExaminationCentreMembershipScope.ALL
    )


def test_membership_scope_split_all_uses_core_not_all() -> None:
    exam = _exam(CentreStructureMode.SPLIT)
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.ALL)
        == ExaminationCentreMembershipScope.CORE
    )


def test_timetable_filters_for_memberships_core_only_school() -> None:
    memberships = {ExaminationCentreMembershipScope.CORE}
    assert timetable_filters_for_memberships(memberships, TimetableDownloadFilter.ALL) == [
        TimetableDownloadFilter.CORE_ONLY
    ]
    assert timetable_filters_for_memberships(memberships, TimetableDownloadFilter.CORE_ONLY) == [
        TimetableDownloadFilter.CORE_ONLY
    ]
    assert timetable_filters_for_memberships(memberships, TimetableDownloadFilter.ELECTIVE_ONLY) == []


def test_timetable_filters_for_memberships_both_scopes_at_centre() -> None:
    memberships = {
        ExaminationCentreMembershipScope.CORE,
        ExaminationCentreMembershipScope.ELECTIVE,
    }
    assert timetable_filters_for_memberships(memberships, TimetableDownloadFilter.ALL) == [
        TimetableDownloadFilter.CORE_ONLY,
        TimetableDownloadFilter.ELECTIVE_ONLY,
    ]


def test_membership_scope_split_core_elective() -> None:
    exam = _exam(CentreStructureMode.SPLIT)
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.CORE)
        == ExaminationCentreMembershipScope.CORE
    )
    assert (
        membership_scope_for_inspector_scope(exam, ExamInspectorSubjectScope.ELECTIVE)
        == ExaminationCentreMembershipScope.ELECTIVE
    )


def test_inspector_scope_from_membership_unified() -> None:
    assert (
        inspector_scope_from_membership_scopes(
            CentreStructureMode.UNIFIED,
            {ExaminationCentreMembershipScope.ALL},
        )
        == ExamInspectorSubjectScope.ALL
    )


def test_inspector_scope_from_membership_split_core_only() -> None:
    assert (
        inspector_scope_from_membership_scopes(
            CentreStructureMode.SPLIT,
            {ExaminationCentreMembershipScope.CORE},
        )
        == ExamInspectorSubjectScope.CORE
    )


def test_inspector_scope_from_membership_split_elective_only() -> None:
    assert (
        inspector_scope_from_membership_scopes(
            CentreStructureMode.SPLIT,
            {ExaminationCentreMembershipScope.ELECTIVE},
        )
        == ExamInspectorSubjectScope.ELECTIVE
    )


def test_inspector_scope_from_membership_split_both() -> None:
    assert (
        inspector_scope_from_membership_scopes(
            CentreStructureMode.SPLIT,
            {
                ExaminationCentreMembershipScope.CORE,
                ExaminationCentreMembershipScope.ELECTIVE,
            },
        )
        == ExamInspectorSubjectScope.ALL
    )


def test_inspector_scope_from_membership_empty_raises() -> None:
    with pytest.raises(ValueError, match="no examination centre membership"):
        inspector_scope_from_membership_scopes(CentreStructureMode.SPLIT, set())


@pytest.mark.asyncio
async def test_list_candidate_write_destinations_orders_scopes() -> None:
    from unittest.mock import AsyncMock, MagicMock
    from uuid import uuid4

    from app.models import ExaminationCentreMembershipScope, Region
    from app.services.centre_resolution import list_candidate_write_destinations_for_school

    centre_core = MagicMock()
    centre_core.id = uuid4()
    centre_core.code = "HOST1"
    centre_core.name = "Host One"
    centre_core.region = Region.GREATER_ACCRA

    centre_elect = MagicMock()
    centre_elect.id = uuid4()
    centre_elect.code = "HOST2"
    centre_elect.name = "Host Two"
    centre_elect.region = Region.ASHANTI

    mem_core = MagicMock()
    mem_core.subject_scope = ExaminationCentreMembershipScope.CORE
    mem_elect = MagicMock()
    mem_elect.subject_scope = ExaminationCentreMembershipScope.ELECTIVE

    result_mock = MagicMock()
    result_mock.all.return_value = [
        (mem_elect, centre_elect),
        (mem_core, centre_core),
    ]
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result_mock)

    school_id = uuid4()
    items = await list_candidate_write_destinations_for_school(session, 1, school_id)
    assert len(items) == 2
    assert items[0].subject_scope == "CORE"
    assert items[0].centre_code == "HOST1"
    assert items[1].subject_scope == "ELECTIVE"
    assert items[1].centre_code == "HOST2"


@pytest.mark.asyncio
async def test_list_candidate_write_destinations_consolidates_same_centre() -> None:
    from unittest.mock import AsyncMock, MagicMock
    from uuid import uuid4

    from app.models import ExaminationCentreMembershipScope, Region
    from app.services.centre_resolution import list_candidate_write_destinations_for_school

    centre = MagicMock()
    centre.id = uuid4()
    centre.code = "HOST1"
    centre.name = "Host One"
    centre.region = Region.GREATER_ACCRA

    mem_core = MagicMock()
    mem_core.subject_scope = ExaminationCentreMembershipScope.CORE
    mem_elect = MagicMock()
    mem_elect.subject_scope = ExaminationCentreMembershipScope.ELECTIVE

    result_mock = MagicMock()
    result_mock.all.return_value = [
        (mem_elect, centre),
        (mem_core, centre),
    ]
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result_mock)

    items = await list_candidate_write_destinations_for_school(session, 1, uuid4())
    assert len(items) == 1
    assert items[0].subject_scope == "ALL"
    assert items[0].centre_code == "HOST1"


@pytest.mark.asyncio
async def test_centre_scope_school_ids_for_host_overview_unions_split_scopes() -> None:
    from unittest.mock import AsyncMock, MagicMock
    from uuid import uuid4

    from app.models import CentreStructureMode, ExaminationCentreMembershipScope
    from app.services.centre_resolution import centre_scope_school_ids_for_host_overview

    centre = MagicMock()
    centre.id = uuid4()
    centre.examination_id = 1

    exam = MagicMock()
    exam.centre_structure_mode = CentreStructureMode.SPLIT

    host_id = uuid4()
    sat_core = uuid4()
    sat_elect = uuid4()

    async def fake_centre_scope(_session, _centre, *, membership_scope=None):
        if membership_scope == ExaminationCentreMembershipScope.CORE:
            return {host_id, sat_core}
        if membership_scope == ExaminationCentreMembershipScope.ELECTIVE:
            return {host_id, sat_elect}
        return set()

    from unittest.mock import patch

    session = AsyncMock()
    with (
        patch(
            "app.services.centre_resolution.get_examination_or_404",
            AsyncMock(return_value=exam),
        ),
        patch(
            "app.services.centre_resolution.centre_scope_school_ids",
            fake_centre_scope,
        ),
    ):
        result = await centre_scope_school_ids_for_host_overview(session, centre)

    assert result == {host_id, sat_core, sat_elect}


@pytest.mark.asyncio
async def test_centre_scope_school_ids_for_inspector_all_unions_split_scopes() -> None:
    """Regression: SPLIT inspector scope ALL should include CORE ∪ ELECTIVE (not intersection)."""
    from unittest.mock import AsyncMock, MagicMock, patch

    from app.models import CentreStructureMode, ExaminationCentreMembershipScope
    from app.services.centre_resolution import centre_scope_school_ids_for_inspector_scope
    from uuid import uuid4

    centre = MagicMock()
    centre.examination_id = 1

    exam = MagicMock()
    exam.centre_structure_mode = CentreStructureMode.SPLIT

    core_school_id = uuid4()
    elective_school_id = uuid4()

    async def fake_centre_scope_ids(_session, _centre, *, membership_scope=None):
        if membership_scope == ExaminationCentreMembershipScope.CORE:
            return {core_school_id}
        if membership_scope == ExaminationCentreMembershipScope.ELECTIVE:
            return {elective_school_id}
        return set()

    session = AsyncMock()
    with (
        patch(
            "app.services.centre_resolution.get_examination_or_404",
            AsyncMock(return_value=exam),
        ),
        patch(
            "app.services.centre_resolution.centre_scope_school_ids",
            fake_centre_scope_ids,
        ),
    ):
        result = await centre_scope_school_ids_for_inspector_scope(
            session, centre, ExamInspectorSubjectScope.ALL
        )

    assert result == {core_school_id, elective_school_id}


@pytest.mark.asyncio
async def test_scope_ids_for_centre_subject_filter_limits_to_membership() -> None:
    from unittest.mock import AsyncMock, MagicMock, patch
    from uuid import uuid4

    from app.schemas.timetable import TimetableDownloadFilter
    from app.services.centre_resolution import scope_ids_for_centre_subject_filter

    centre = MagicMock()
    core_only = uuid4()
    elective_only = uuid4()
    both = uuid4()
    scope_ids = {core_only, elective_only, both}

    async def fake_centre_scope(_session, _centre, *, membership_scope=None):
        from app.models import ExaminationCentreMembershipScope

        if membership_scope == ExaminationCentreMembershipScope.CORE:
            return {core_only, both}
        if membership_scope == ExaminationCentreMembershipScope.ELECTIVE:
            return {elective_only, both}
        return set()

    session = AsyncMock()
    with (
        patch(
            "app.services.centre_resolution.get_examination_or_404",
            new_callable=AsyncMock,
            return_value=MagicMock(centre_structure_mode=CentreStructureMode.SPLIT),
        ),
        patch(
            "app.services.centre_resolution.centre_scope_school_ids",
            fake_centre_scope,
        ),
    ):
        core_result = await scope_ids_for_centre_subject_filter(
            session,
            centre,
            scope_ids,
            subject_filter=TimetableDownloadFilter.CORE_ONLY,
        )
        elect_result = await scope_ids_for_centre_subject_filter(
            session,
            centre,
            scope_ids,
            subject_filter=TimetableDownloadFilter.ELECTIVE_ONLY,
        )

    assert core_result == {core_only, both}
    assert elect_result == {elective_only, both}


@pytest.mark.asyncio
async def test_scope_ids_for_centre_subject_filter_unified_keeps_all_schools() -> None:
    from unittest.mock import AsyncMock, MagicMock, patch
    from uuid import uuid4

    from app.schemas.timetable import TimetableDownloadFilter
    from app.services.centre_resolution import scope_ids_for_centre_subject_filter

    centre = MagicMock()
    centre.examination_id = 1
    scope_ids = {uuid4(), uuid4()}

    session = AsyncMock()
    with patch(
        "app.services.centre_resolution.get_examination_or_404",
        new_callable=AsyncMock,
        return_value=MagicMock(centre_structure_mode=CentreStructureMode.UNIFIED),
    ):
        core_result = await scope_ids_for_centre_subject_filter(
            session,
            centre,
            scope_ids,
            subject_filter=TimetableDownloadFilter.CORE_ONLY,
        )
        elect_result = await scope_ids_for_centre_subject_filter(
            session,
            centre,
            scope_ids,
            subject_filter=TimetableDownloadFilter.ELECTIVE_ONLY,
        )

    assert core_result == scope_ids
    assert elect_result == scope_ids


@pytest.mark.asyncio
async def test_list_centres_for_examination_filters_by_membership_scope() -> None:
    from unittest.mock import AsyncMock, MagicMock

    from app.services.centre_resolution import list_centres_for_examination

    core_centre = MagicMock()
    core_centre.memberships = [
        MagicMock(subject_scope=ExaminationCentreMembershipScope.CORE),
    ]
    elect_centre = MagicMock()
    elect_centre.memberships = [
        MagicMock(subject_scope=ExaminationCentreMembershipScope.ELECTIVE),
    ]
    both_centre = MagicMock()
    both_centre.memberships = [
        MagicMock(subject_scope=ExaminationCentreMembershipScope.CORE),
        MagicMock(subject_scope=ExaminationCentreMembershipScope.ELECTIVE),
    ]

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [
        core_centre,
        elect_centre,
        both_centre,
    ]
    session = AsyncMock()
    session.execute.return_value = mock_result

    core_only = await list_centres_for_examination(
        session, 1, membership_scope=ExaminationCentreMembershipScope.CORE
    )
    elect_only = await list_centres_for_examination(
        session, 1, membership_scope=ExaminationCentreMembershipScope.ELECTIVE
    )
    all_centres = await list_centres_for_examination(session, 1)

    assert core_only == [core_centre, both_centre]
    assert elect_only == [elect_centre, both_centre]
    assert all_centres == [core_centre, elect_centre, both_centre]


@pytest.mark.asyncio
async def test_centre_has_membership_for_subject_filter_unified_always_true() -> None:
    from unittest.mock import AsyncMock, MagicMock, patch

    from app.schemas.timetable import TimetableDownloadFilter
    from app.services.centre_resolution import centre_has_membership_for_subject_filter

    centre = MagicMock(examination_id=1)
    exam = SimpleNamespace(centre_structure_mode=CentreStructureMode.UNIFIED)
    session = AsyncMock()

    with patch(
        "app.services.centre_resolution.get_examination_or_404",
        AsyncMock(return_value=exam),
    ):
        assert await centre_has_membership_for_subject_filter(
            session,
            centre,
            subject_filter=TimetableDownloadFilter.CORE_ONLY,
        )


def test_apply_centre_search_q_filters_code_and_name() -> None:
    from unittest.mock import MagicMock

    from app.routers.examination_centres import _apply_centre_search_q

    c1 = MagicMock(code="ABC01", name="Alpha Centre")
    c2 = MagicMock(code="XYZ99", name="Beta Host")
    assert _apply_centre_search_q([c1, c2], None) == [c1, c2]
    assert _apply_centre_search_q([c1, c2], "abc") == [c1]
    assert _apply_centre_search_q([c1, c2], "beta") == [c2]
    assert _apply_centre_search_q([c1, c2], "   ") == [c1, c2]
