"""Tests for examiner allowance compensation helpers."""

from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from app.models import ExaminerAllowanceType, ExaminerRosterSource, ExaminerType, Region, RosterAllowanceKey
from app.services.examiner_compensation import (
    MarkingDefaults,
    compensation_for_examiner,
    compute_payout_adjustment_lines,
    effective_marking_rate,
    examiner_type_from_api_label,
)
from app.services.examiner_roster_allowance_eligibility import default_eligibility_map


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
    ex.chief_examiners_report_count = 1
    ex.reporting_allowance_enabled = False
    ex.num_days = None
    ex.roster_source = __import__("app.models", fromlist=["ExaminerRosterSource"]).ExaminerRosterSource.MANUAL
    return ex


def test_effective_marking_rate_uses_subject_then_default() -> None:
    rates = {(1, 1): Decimal("3")}
    defaults = MarkingDefaults(paper_1=Decimal("1.5"), paper_2=Decimal("2.5"))
    assert effective_marking_rate(rates, defaults, 1, 1) == Decimal("3")
    assert effective_marking_rate(rates, defaults, 2, 1) == Decimal("1.5")
    assert effective_marking_rate(rates, defaults, 2, 2) == Decimal("2.5")
    assert effective_marking_rate({}, defaults, 9, 1) == Decimal("1.5")


def test_sitting_allowance_daily_rate_times_days() -> None:
    ex = _examiner(examiner_type=ExaminerType.ASSISTANT)
    ex.num_days = 5
    sitting_rates = {ExaminerType.ASSISTANT: Decimal("40")}
    comp = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        sitting_rates=sitting_rates,
        default_days={ExaminerType.ASSISTANT: 3},
    )
    assert comp.sitting_allowance_ghs == Decimal("200")
    assert comp.sitting_withholding_tax_ghs == Decimal("0")
    assert comp.sitting_net_ghs == Decimal("200")
    assert comp.sitting_num_days == 5
    assert comp.total_payable_ghs == Decimal("200")


def test_sitting_allowance_uses_default_days_when_num_days_null() -> None:
    ex = _examiner(examiner_type=ExaminerType.TEAM_LEADER)
    ex.num_days = None
    comp = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        sitting_rates={ExaminerType.TEAM_LEADER: Decimal("10")},
        default_days={ExaminerType.TEAM_LEADER: 4},
    )
    assert comp.sitting_allowance_ghs == Decimal("40")
    assert comp.sitting_withholding_tax_ghs == Decimal("0")
    assert comp.sitting_net_ghs == Decimal("40")
    assert comp.sitting_num_days == 4
    assert comp.total_payable_ghs == Decimal("40")


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
    assert comp.marking_withholding_tax_ghs == Decimal("11.00")
    assert comp.marking_net_ghs == Decimal("99.00")
    assert comp.total_payable_ghs == Decimal("294.00")
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


def test_subject_breakdowns_only_include_allocated_papers() -> None:
    ex = _examiner(subjects=[_subject_link(1, "MATH", "Mathematics")])
    marking_rates = {(1, 1): Decimal("2"), (1, 2): Decimal("5")}
    allocated = {(ex.id, 1, 2): 4}
    comp = compensation_for_examiner(ex, {}, marking_rates, {}, {}, {}, {}, allocated)
    assert len(comp.subject_breakdowns) == 1
    assert comp.subject_breakdowns[0].paper_number == 2
    assert comp.subject_breakdowns[0].allocated_booklets == 4
    assert comp.marking_allowance_ghs == Decimal("20")


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
    assert comp.marking_net_ghs == Decimal("18.00")
    assert comp.total_payable_ghs == Decimal("98.00")


def test_travel_resolves_when_examiner_region_stored_as_label_string() -> None:
    ex = _examiner(subjects=[])
    ex.region = "Upper East"
    travel = {Region.UPPER_EAST: Decimal("40")}
    travel_zones, travel_zone_names, factors = _zone_context(
        region=Region.UPPER_EAST,
        factor=Decimal("1.5"),
    )
    comp = compensation_for_examiner(ex, {}, {}, travel, travel_zones, travel_zone_names, factors, {})
    assert comp.travel_base_ghs == Decimal("40")
    assert comp.travel_and_transport_ghs == Decimal("60")
    assert comp.total_payable_ghs == Decimal("60")


def test_total_payable_includes_travel_with_role_allowances() -> None:
    ex = _examiner(region=Region.VOLTA, subjects=[])
    ex.examiner_type = "assistant_examiner"
    role_rates = {
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.INTERNAL_COMMUTING): Decimal("25"),
    }
    travel = {Region.VOLTA: Decimal("40")}
    travel_zones, travel_zone_names, factors = _zone_context(
        region=Region.VOLTA,
        factor=Decimal("2"),
    )
    comp = compensation_for_examiner(
        ex, role_rates, {}, travel, travel_zones, travel_zone_names, factors, {}
    )
    assert comp.internal_commuting_ghs == Decimal("25")
    assert comp.travel_and_transport_ghs == Decimal("80")
    assert comp.total_payable_ghs == Decimal("105")


def test_examiner_type_from_api_label_accepts_assistant_chief() -> None:
    assert examiner_type_from_api_label("assistant_chief_examiner") == ExaminerType.ASSISTANT_CHIEF


def test_examiner_type_column_binds_api_value() -> None:
    from app.models import examiner_type_column

    col_type = examiner_type_column().type
    assert col_type.process_bind_param(ExaminerType.ASSISTANT_CHIEF, None) == "assistant_chief_examiner"


def test_withholding_tax_and_payout_buckets() -> None:
    ex = _examiner(
        region=Region.VOLTA,
        subjects=[_subject_link(1, "MATH", "Mathematics")],
    )
    role_rates = {
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.RESPONSIBILITY): Decimal("100"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.VETTING_OF_SCRIPTS): Decimal("50"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.INTERNAL_COMMUTING): Decimal("20"),
    }
    marking_rates = {(1, 1): Decimal("10")}
    allocated = {(ex.id, 1, 1): 5}
    travel = {Region.VOLTA: Decimal("30")}
    comp = compensation_for_examiner(ex, role_rates, marking_rates, travel, {}, {}, {}, allocated)

    assert comp.marking_allowance_ghs == Decimal("50")
    assert comp.marking_withholding_tax_ghs == Decimal("5.00")
    assert comp.marking_net_ghs == Decimal("45.00")
    assert comp.vetting_withholding_tax_ghs == Decimal("5.00")
    assert comp.vetting_net_ghs == Decimal("45.00")
    assert comp.payout_travel_commuting_ghs == Decimal("50")
    assert comp.payout_allowances_marking_ghs == Decimal("190")
    assert comp.total_payable_ghs == Decimal("240")


def test_special_roster_eligibility_applies_role_allowances_not_travel() -> None:
    from app.models import Examiner, ExaminerPayoutOverride

    ex_id = uuid4()
    ex = Examiner(
        id=ex_id,
        examination_id=1,
        name="Special",
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        portal_token="tok",
        roster_source=ExaminerRosterSource.SPECIAL,
        chief_examiners_report_count=0,
    )
    override = ExaminerPayoutOverride(
        examiner_id=ex_id,
        description="Extra",
        paper_1_script_count=10,
        paper_2_script_count=0,
    )
    role_rates = {
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.RESPONSIBILITY): Decimal("100"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.INCONVENIENCE): Decimal("25"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.INTERNAL_COMMUTING): Decimal("20"),
    }
    travel = {Region.GREATER_ACCRA: Decimal("30")}
    comp = compensation_for_examiner(
        ex,
        role_rates,
        {},
        travel,
        {},
        {},
        {},
        {},
        payout_override=override,
        marking_defaults=MarkingDefaults(paper_1=Decimal("2")),
        roster_eligibility=default_eligibility_map(),
    )
    assert comp.responsibility_allowance_ghs == Decimal("100")
    assert comp.inconvenience_allowance_ghs == Decimal("25")
    assert comp.travel_and_transport_ghs == Decimal("0")
    assert comp.internal_commuting_ghs == Decimal("0")
    assert comp.marking_allowance_ghs == Decimal("20")


def test_compute_payout_adjustment_preserves_group_source() -> None:
    from app.services.examiner_compensation import PayoutAdjustmentLine, compute_payout_adjustment_lines

    lines, gross, tax, net = compute_payout_adjustment_lines(
        [
            PayoutAdjustmentLine(
                description="Group bonus",
                amount_ghs=Decimal("100"),
                is_taxable=True,
                tax_ghs=Decimal("0"),
                net_ghs=Decimal("100"),
                source="group",
                group_name="Zone A",
            )
        ]
    )
    assert gross == Decimal("100")
    assert tax == Decimal("10")
    assert net == Decimal("90")
    assert lines[0].source == "group"
    assert lines[0].group_name == "Zone A"


def test_taxable_payout_adjustment_applies_withholding() -> None:
    ex = _examiner()
    adj = [MagicMock(description="Extra report", amount_ghs=Decimal("100"), is_taxable=True, id=uuid4())]
    computed, gross, tax, net = compute_payout_adjustment_lines(adj)
    assert gross == Decimal("100")
    assert tax == Decimal("10")
    assert net == Decimal("90")
    assert computed[0].description == "Extra report"

    comp = compensation_for_examiner(
        ex, {}, {}, {}, {}, {}, {}, {}, payout_adjustments=adj
    )
    assert comp.adjustments_gross_ghs == Decimal("100")
    assert comp.adjustments_tax_ghs == Decimal("10")
    assert comp.adjustments_net_ghs == Decimal("90")
    assert comp.payout_allowances_marking_ghs == Decimal("90")
    assert comp.total_payable_ghs == Decimal("90")


def test_untaxed_payout_adjustment_paid_in_full() -> None:
    ex = _examiner()
    adj = [MagicMock(description="Top-up", amount_ghs=Decimal("100"), is_taxable=False, id=None)]
    comp = compensation_for_examiner(ex, {}, {}, {}, {}, {}, {}, {}, payout_adjustments=adj)
    assert comp.adjustments_gross_ghs == Decimal("100")
    assert comp.adjustments_tax_ghs == Decimal("0")
    assert comp.adjustments_net_ghs == Decimal("100")
    assert comp.total_payable_ghs == Decimal("100")


def test_multiple_payout_adjustments_mix_tax_flags() -> None:
    ex = _examiner()
    adj = [
        MagicMock(description="Taxed", amount_ghs=Decimal("50"), is_taxable=True, id=None),
        MagicMock(description="Untaxed", amount_ghs=Decimal("30"), is_taxable=False, id=None),
    ]
    comp = compensation_for_examiner(ex, {}, {}, {}, {}, {}, {}, {}, payout_adjustments=adj)
    assert comp.adjustments_gross_ghs == Decimal("80")
    assert comp.adjustments_tax_ghs == Decimal("5")
    assert comp.adjustments_net_ghs == Decimal("75")
    assert len(comp.payout_adjustments) == 2
    assert comp.total_payable_ghs == Decimal("75")


def test_empty_payout_adjustments_clear_to_zero() -> None:
    ex = _examiner()
    comp = compensation_for_examiner(ex, {}, {}, {}, {}, {}, {}, {}, payout_adjustments=[])
    assert comp.adjustments_gross_ghs == Decimal("0")
    assert comp.adjustments_tax_ghs == Decimal("0")
    assert comp.adjustments_net_ghs == Decimal("0")
    assert comp.payout_adjustments == []
    assert comp.total_payable_ghs == Decimal("0")


def test_compensation_skips_unloaded_payout_adjustments_relationship() -> None:
    """Omit explicit adjustments without touching examiner.payout_adjustments (async-safe)."""
    ex = _examiner()
    type(ex).payout_adjustments = property(
        lambda self: (_ for _ in ()).throw(RuntimeError("lazy load attempted"))
    )
    comp = compensation_for_examiner(ex, {}, {}, {}, {}, {}, {}, {}, payout_adjustments=None)
    assert comp.adjustments_net_ghs == Decimal("0")
    assert comp.payout_adjustments == []


def test_payout_adjustments_independent_of_eligibility() -> None:
    """Adjustments still pay when roster and group eligibility zero out other lines."""
    ex = _examiner()
    role_rates = {
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.RESPONSIBILITY): Decimal("100"),
        (ExaminerType.ASSISTANT, ExaminerAllowanceType.VETTING_OF_SCRIPTS): Decimal("50"),
    }
    travel = {Region.UPPER_EAST: Decimal("40")}
    roster_off = {
        (ExaminerRosterSource.MANUAL, key): False for key in RosterAllowanceKey
    }
    group_off = {ex.id: set()}
    adj = [MagicMock(description="Manual top-up", amount_ghs=Decimal("200"), is_taxable=True, id=None)]
    comp = compensation_for_examiner(
        ex,
        role_rates,
        {},
        travel,
        {},
        {},
        {},
        {},
        payout_adjustments=adj,
        roster_eligibility=roster_off,
        group_eligibility=group_off,
    )
    assert comp.responsibility_allowance_ghs == Decimal("0")
    assert comp.vetting_of_scripts_ghs == Decimal("0")
    assert comp.travel_and_transport_ghs == Decimal("0")
    assert comp.adjustments_net_ghs == Decimal("180")
    assert comp.total_payable_ghs == Decimal("180")
