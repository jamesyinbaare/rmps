"""Tests for examiner allowance compensation helpers."""

from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from app.models import ExaminerAllowanceType, ExaminerType, Region
from app.services.examiner_compensation import (
    compensation_for_examiner,
    examiner_type_from_api_label,
)


def _subject_link(subject_id: int, code: str, name: str) -> MagicMock:
    subject = MagicMock()
    subject.id = subject_id
    subject.code = code
    subject.original_code = code
    subject.name = name
    link = MagicMock()
    link.subject_id = subject_id
    link.subject = subject
    return link


def _examiner(
    *,
    examiner_id: object | None = None,
    examiner_type: ExaminerType = ExaminerType.ASSISTANT,
    region: Region = Region.UPPER_EAST,
    subjects: list[MagicMock] | None = None,
) -> MagicMock:
    ex = MagicMock()
    ex.id = examiner_id or uuid4()
    ex.examiner_type = examiner_type
    ex.region = region
    ex.subjects = subjects or []
    return ex


def _zone_context(
    *,
    region: Region,
    zone_name: str = "Zone 1",
    zone_id: UUID | None = None,
    role: ExaminerType = ExaminerType.ASSISTANT,
    factor: Decimal | None = None,
) -> tuple[dict[Region, UUID], dict[UUID, str], dict[tuple[ExaminerType, UUID], Decimal | None]]:
    resolved_zone_id = zone_id or uuid4()
    travel_zones = {region: resolved_zone_id}
    travel_zone_names = {resolved_zone_id: zone_name}
    factors: dict[tuple[ExaminerType, UUID], Decimal | None] = {}
    if factor is not None:
        factors[(role, resolved_zone_id)] = factor
    return travel_zones, travel_zone_names, factors


def test_compensation_flat_role_allowances_plus_marking_and_travel() -> None:
    ex = _examiner(
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.ASHANTI,
        subjects=[_subject_link(1, "MATH", "Mathematics"), _subject_link(2, "ENG", "English")],
    )
    role_rates = {
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.RESPONSIBILITY): Decimal("100"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.INCONVENIENCE): Decimal("20"),
        (ExaminerType.CHIEF, ExaminerAllowanceType.RESPONSIBILITY): Decimal("999"),
    }
    marking_rates = {(1, 1): Decimal("2.50"), (2, 1): Decimal("1.00")}
    allocated = {(ex.id, 1, 1): 40, (ex.id, 2, 1): 10}
    travel = {Region.ASHANTI: Decimal("75")}
    comp = compensation_for_examiner(ex, role_rates, marking_rates, travel, {}, {}, {}, allocated)
    assert comp.responsibility_allowance_ghs == Decimal("100")
    assert comp.inconvenience_allowance_ghs == Decimal("20")
    assert comp.marking_allowance_ghs == Decimal("110")
    assert comp.travel_and_transport_ghs == Decimal("75")
    assert comp.total_allocated_scripts == 50
    assert comp.total_payable_ghs == Decimal("305")
    assert len(comp.subject_breakdowns) == 2


def test_marking_rates_differ_by_paper_number() -> None:
    ex = _examiner(subjects=[_subject_link(1, "MATH", "Mathematics")])
    marking_rates = {(1, 1): Decimal("2"), (1, 2): Decimal("5")}
    allocated = {(ex.id, 1, 1): 10, (ex.id, 1, 2): 4}
    comp = compensation_for_examiner(ex, {}, marking_rates, {}, {}, {}, {}, allocated)
    assert comp.marking_allowance_ghs == Decimal("40")
    assert comp.total_allocated_scripts == 14
    by_paper = {row.paper_number: row.marking_allowance_ghs for row in comp.subject_breakdowns}
    assert by_paper[1] == Decimal("20")
    assert by_paper[2] == Decimal("20")


def test_same_marking_rate_applies_to_all_roles() -> None:
    subjects = [_subject_link(1, "MATH", "Mathematics")]
    marking_rates = {(1, 1): Decimal("3")}
    allocated_count = 5
    chief = _examiner(examiner_type=ExaminerType.CHIEF, subjects=subjects)
    assistant = _examiner(examiner_type=ExaminerType.ASSISTANT, subjects=subjects)
    role_rates = {
        (ExaminerType.CHIEF, ExaminerAllowanceType.RESPONSIBILITY): Decimal("0"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.RESPONSIBILITY): Decimal("0"),
    }
    chief_allocated = {(chief.id, 1, 1): allocated_count}
    assistant_allocated = {(assistant.id, 1, 1): allocated_count}
    chief_comp = compensation_for_examiner(chief, role_rates, marking_rates, {}, {}, {}, {}, chief_allocated)
    assistant_comp = compensation_for_examiner(
        assistant, role_rates, marking_rates, {}, {}, {}, {}, assistant_allocated
    )
    assert chief_comp.marking_allowance_ghs == Decimal("15")
    assert assistant_comp.marking_allowance_ghs == Decimal("15")


def test_unset_rates_treated_as_zero() -> None:
    ex = _examiner(subjects=[_subject_link(1, "MATH", "Mathematics")])
    comp = compensation_for_examiner(ex, {}, {}, {}, {}, {}, {}, {})
    assert comp.total_payable_ghs == Decimal("0")


def test_travel_applied_once_from_home_region() -> None:
    ex = _examiner(region=Region.VOLTA, subjects=[])
    travel = {Region.VOLTA: Decimal("40"), Region.ASHANTI: Decimal("99")}
    comp = compensation_for_examiner(ex, {}, {}, travel, {}, {}, {}, {})
    assert comp.travel_and_transport_ghs == Decimal("40")
    assert comp.travel_base_ghs == Decimal("40")
    assert comp.travel_role_factor == Decimal("1")
    assert comp.travel_zone_name is None
    assert comp.total_payable_ghs == Decimal("40")


def test_travel_role_zone_factor_multiplies_regional_amount() -> None:
    ex = _examiner(region=Region.VOLTA, subjects=[])
    travel = {Region.VOLTA: Decimal("40")}
    travel_zones, travel_zone_names, factors = _zone_context(
        region=Region.VOLTA,
        zone_name="Southern belt",
        factor=Decimal("1.5"),
    )
    comp = compensation_for_examiner(ex, {}, {}, travel, travel_zones, travel_zone_names, factors, {})
    assert comp.travel_base_ghs == Decimal("40")
    assert comp.travel_zone_name == "Southern belt"
    assert comp.travel_role_factor == Decimal("1.5")
    assert comp.travel_and_transport_ghs == Decimal("60")
    assert comp.total_payable_ghs == Decimal("60")


def test_unset_travel_role_factor_defaults_to_one() -> None:
    ex = _examiner(region=Region.VOLTA, subjects=[])
    travel = {Region.VOLTA: Decimal("40")}
    travel_zones, travel_zone_names, factors = _zone_context(region=Region.VOLTA)
    comp = compensation_for_examiner(ex, {}, {}, travel, travel_zones, travel_zone_names, factors, {})
    assert comp.travel_role_factor == Decimal("1")
    assert comp.travel_and_transport_ghs == Decimal("40")


def test_unassigned_region_uses_factor_one() -> None:
    ex = _examiner(region=Region.VOLTA, subjects=[])
    travel = {Region.VOLTA: Decimal("40")}
    zone_id = uuid4()
    factors = {(ExaminerType.ASSISTANT, zone_id): Decimal("2")}
    comp = compensation_for_examiner(ex, {}, {}, travel, {}, {}, factors, {})
    assert comp.travel_role_factor == Decimal("1")
    assert comp.travel_and_transport_ghs == Decimal("40")
    assert comp.travel_zone_name is None


def test_travel_role_factor_only_affects_travel_not_marking() -> None:
    ex = _examiner(subjects=[_subject_link(1, "MATH", "Mathematics")])
    marking_rates = {(1, 1): Decimal("2")}
    allocated = {(ex.id, 1, 1): 10}
    travel = {Region.UPPER_EAST: Decimal("40")}
    travel_zones, travel_zone_names, factors = _zone_context(
        region=Region.UPPER_EAST,
        factor=Decimal("2"),
    )
    comp = compensation_for_examiner(
        ex, {}, marking_rates, travel, travel_zones, travel_zone_names, factors, allocated
    )
    assert comp.marking_allowance_ghs == Decimal("20")
    assert comp.travel_and_transport_ghs == Decimal("80")
    assert comp.total_payable_ghs == Decimal("100")


def test_examiner_type_from_api_label_accepts_assistant_chief() -> None:
    assert examiner_type_from_api_label("assistant_chief_examiner") == ExaminerType.ASSISTANT_CHIEF
