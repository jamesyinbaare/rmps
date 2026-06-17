"""Unassigned envelope eligibility on allocation run responses."""

from unittest.mock import MagicMock
from uuid import uuid4

from app.models import Examiner, ExaminerSubject, ExaminerType, Region, Zone
from app.services.script_allocation import build_eligible_pairs


def _examiner(*, ex_id, subject_id: int, region: Region, group_id):
    ex = MagicMock(spec=Examiner)
    ex.id = ex_id
    ex.examiner_type = ExaminerType.ASSISTANT
    ex.region = region
    ex.subjects = [MagicMock(spec=ExaminerSubject, subject_id=subject_id)]
    return ex


def test_build_eligible_pairs_groups_examiner_ids_per_envelope() -> None:
    subject_id = 7
    g_mark = uuid4()
    g_src = uuid4()
    ex_eligible = uuid4()
    ex_own_cohort = uuid4()
    env_id = uuid4()

    env = MagicMock()
    env.id = env_id
    env.booklet_count = 12
    env.envelope_number = 1

    series = MagicMock()
    series.subject_id = subject_id
    series.series_number = 1

    school = MagicMock()
    school.region = Region.GREATER_ACCRA
    school.zone = Zone.A

    examiner_eligible = _examiner(
        ex_id=ex_eligible,
        subject_id=subject_id,
        region=Region.ASHANTI,
        group_id=g_mark,
    )
    examiner_own = _examiner(
        ex_id=ex_own_cohort,
        subject_id=subject_id,
        region=Region.GREATER_ACCRA,
        group_id=g_mark,
    )

    pairs, _ = build_eligible_pairs(
        [(env, series, school)],
        [examiner_eligible, examiner_own],
        region_to_source_group={Region.GREATER_ACCRA: g_src},
        examiner_to_marking_group={
            ex_eligible: g_mark,
            ex_own_cohort: g_mark,
        },
        cross_marking_rules={g_mark: {g_src}},
        exclude_home_zone_or_region=True,
    )

    eligible_by_env: dict = {}
    for pair in pairs:
        eligible_by_env.setdefault(pair.envelope_id, set()).add(pair.examiner_id)

    assert eligible_by_env[env_id] == {ex_eligible}
