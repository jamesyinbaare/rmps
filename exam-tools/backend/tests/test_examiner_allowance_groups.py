"""Tests for exam-scoped examiner allowance groups."""

from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models import ExaminerRosterSource, ExaminerType, Region, RosterAllowanceKey
from app.services.examiner_allowance_groups import (
    GENERAL_GROUP_NAME,
    is_group_allowance_enabled,
    parse_allowance_groups_cell,
)
from app.services.examiner_compensation import compensation_for_examiner
from app.services.examiner_roster_allowance_eligibility import default_eligibility_map


def _examiner(*, roster_source: ExaminerRosterSource = ExaminerRosterSource.MANUAL) -> MagicMock:
    ex = MagicMock()
    ex.id = uuid4()
    ex.examiner_type = ExaminerType.ASSISTANT
    ex.region = Region.GREATER_ACCRA
    ex.subjects = []
    ex.chief_examiners_report_count = 0
    ex.reporting_allowance_enabled = False
    ex.num_days = 2
    ex.roster_source = roster_source
    return ex


def test_parse_allowance_groups_cell() -> None:
    assert parse_allowance_groups_cell(None) == []
    assert parse_allowance_groups_cell("") == []
    assert parse_allowance_groups_cell("Sitting eligible, Zone A") == ["Sitting eligible", "Zone A"]
    assert parse_allowance_groups_cell(GENERAL_GROUP_NAME) == [GENERAL_GROUP_NAME]


def test_is_group_allowance_enabled_or_across_memberships() -> None:
    examiner_id = uuid4()
    enabled = {
        examiner_id: {RosterAllowanceKey.MARKING, RosterAllowanceKey.TRAVEL},
    }
    assert is_group_allowance_enabled(enabled, examiner_id, RosterAllowanceKey.MARKING) is True
    assert is_group_allowance_enabled(enabled, examiner_id, RosterAllowanceKey.SITTING) is False
    assert is_group_allowance_enabled(None, examiner_id, RosterAllowanceKey.SITTING) is True
    # No membership row yet → treat as enabled until backfilled
    assert is_group_allowance_enabled({}, examiner_id, RosterAllowanceKey.SITTING) is True


def test_sitting_paid_only_when_group_enables_it() -> None:
    ex = _examiner()
    sitting_rates = {ExaminerType.ASSISTANT: Decimal("50")}
    roster = default_eligibility_map()
    # General sitting off: empty enabled set for examiner
    group_map = {ex.id: {RosterAllowanceKey.MARKING}}
    blocked = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        sitting_rates=sitting_rates,
        default_days={ExaminerType.ASSISTANT: 2},
        roster_eligibility=roster,
        group_eligibility=group_map,
    )
    assert blocked.sitting_allowance_ghs == Decimal("0")

    # Custom group enables sitting
    group_map_ok = {ex.id: {RosterAllowanceKey.SITTING, RosterAllowanceKey.MARKING}}
    paid = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        sitting_rates=sitting_rates,
        default_days={ExaminerType.ASSISTANT: 2},
        roster_eligibility=roster,
        group_eligibility=group_map_ok,
    )
    assert paid.sitting_allowance_ghs == Decimal("100")
    assert paid.sitting_withholding_tax_ghs == Decimal("0")
    assert paid.sitting_net_ghs == Decimal("100")


def test_group_special_allowance_applies_while_member_only() -> None:
    """Live membership: group lines present only while examiner is treated as a member."""
    from app.services.examiner_compensation import PayoutAdjustmentLine

    ex = _examiner()
    group_line = PayoutAdjustmentLine(
        description="Sitting top-up",
        amount_ghs=Decimal("40"),
        is_taxable=False,
        tax_ghs=Decimal("0"),
        net_ghs=Decimal("40"),
        source="group",
        group_name="Sitting eligible",
    )
    personal = MagicMock(
        description="Personal",
        amount_ghs=Decimal("10"),
        is_taxable=False,
        id=None,
    )

    with_group = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        payout_adjustments=[personal, group_line],
    )
    assert with_group.adjustments_net_ghs == Decimal("50")
    assert with_group.total_payable_ghs == Decimal("50")
    assert any(line.source == "group" for line in with_group.payout_adjustments)
    assert any(line.group_name == "Sitting eligible" for line in with_group.payout_adjustments)

    # Member removed → only personal line remains
    without_group = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        payout_adjustments=[personal],
    )
    assert without_group.adjustments_net_ghs == Decimal("10")
    assert without_group.total_payable_ghs == Decimal("10")
    assert all(line.source == "examiner" for line in without_group.payout_adjustments)

    # Rejoined → group line returns
    rejoined = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        payout_adjustments=[personal, group_line],
    )
    assert rejoined.adjustments_net_ghs == Decimal("50")


def test_special_roster_sitting_off_blocks_even_if_group_enables() -> None:
    ex = _examiner(roster_source=ExaminerRosterSource.SPECIAL)
    sitting_rates = {ExaminerType.ASSISTANT: Decimal("50")}
    roster = default_eligibility_map()
    # Special defaults sitting off; group still enables sitting → still unpaid
    group_map = {ex.id: set(RosterAllowanceKey)}
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
        default_days={ExaminerType.ASSISTANT: 2},
        roster_eligibility=roster,
        group_eligibility=group_map,
    )
    assert comp.sitting_allowance_ghs == Decimal("0")


def test_allowance_group_adjustments_put_schema() -> None:
    from app.schemas.examination_allowance_group import AllowanceGroupAdjustmentsPut

    body = AllowanceGroupAdjustmentsPut(
        adjustments=[
            {"description": "Special sitting", "amount_ghs": Decimal("25"), "is_taxable": False},
        ]
    )
    assert len(body.adjustments) == 1
    assert body.adjustments[0].description == "Special sitting"


@pytest.mark.asyncio
async def test_group_adjustments_require_super_admin() -> None:
    from unittest.mock import MagicMock

    from fastapi import HTTPException

    from app.dependencies.auth import super_admin_only
    from app.models import UserRole

    finance = MagicMock(role=UserRole.FINANCE_OFFICER, is_active=True)
    with pytest.raises(HTTPException):
        await super_admin_only(finance)

    admin = MagicMock(role=UserRole.SUPER_ADMIN, is_active=True)
    assert await super_admin_only(admin) is admin


def test_detail_export_includes_group_name_in_adjustments_detail() -> None:
    from datetime import datetime
    from io import BytesIO
    from uuid import uuid4

    from openpyxl import load_workbook

    from app.schemas.admin_examiner_allowance import AdminExaminerAllowanceRow, ExaminerPayoutAdjustmentRow
    from app.schemas.examination_examiner_allowance_rate import SubjectMarkingBreakdownRow
    from app.services.examiner_allowance_export import detail_workbook_bytes

    item = AdminExaminerAllowanceRow(
        id=uuid4(),
        examination_id=1,
        examination_label="BECE 2026",
        full_name="Alice",
        reference_code="MATH-AE1",
        examiner_type="assistant_examiner",
        region="Ashanti",
        subject_codes="MATH",
        subject_names="Mathematics",
        bank_branch_id=uuid4(),
        bank_code="001234",
        bank_name="GCB",
        branch_name="Kumasi",
        account_number="1234567890123",
        phone_number="0550000000",
        roster_source="manual",
        chief_examiners_report_count=1,
        reporting_allowance_enabled=False,
        payout_description=None,
        paper_1_script_count=0,
        paper_2_script_count=0,
        responsibility_allowance_ghs=Decimal("0"),
        inconvenience_allowance_ghs=Decimal("0"),
        chief_examiners_report_ghs=Decimal("0"),
        vetting_of_scripts_ghs=Decimal("0"),
        internal_commuting_ghs=Decimal("0"),
        sitting_allowance_ghs=Decimal("0"),
        sitting_daily_rate_ghs=Decimal("0"),
        sitting_num_days=0,
        sitting_withholding_tax_ghs=Decimal("0"),
        sitting_net_ghs=Decimal("0"),
        marking_allowance_ghs=Decimal("0"),
        travel_base_ghs=Decimal("0"),
        travel_zone_name=None,
        travel_role_factor=Decimal("1"),
        travel_and_transport_ghs=Decimal("0"),
        total_allocated_scripts=0,
        marking_withholding_tax_ghs=Decimal("0"),
        marking_net_ghs=Decimal("0"),
        vetting_withholding_tax_ghs=Decimal("0"),
        vetting_net_ghs=Decimal("0"),
        payout_travel_commuting_ghs=Decimal("0"),
        payout_allowances_marking_ghs=Decimal("40"),
        total_payable_ghs=Decimal("40"),
        subject_breakdowns=[
            SubjectMarkingBreakdownRow(
                subject_id=1,
                subject_code="MATH",
                subject_name="Mathematics",
                paper_number=1,
                allocated_booklets=0,
                marking_allowance_ghs=Decimal("0"),
            )
        ],
        payout_adjustments=[
            ExaminerPayoutAdjustmentRow(
                description="Sitting top-up",
                amount_ghs=Decimal("40"),
                is_taxable=False,
                tax_ghs=Decimal("0"),
                net_ghs=Decimal("40"),
                source="group",
                group_name="Sitting eligible",
            )
        ],
        adjustments_gross_ghs=Decimal("40"),
        adjustments_tax_ghs=Decimal("0"),
        adjustments_net_ghs=Decimal("40"),
        created_at=datetime(2026, 6, 1),
        updated_at=datetime(2026, 6, 1),
    )
    payload = detail_workbook_bytes([item], title="Test")
    wb = load_workbook(BytesIO(payload))
    ws = wb.active
    assert ws is not None
    headers = [ws.cell(row=2, column=c).value for c in range(1, 50) if ws.cell(row=2, column=c).value]
    detail_col = headers.index("Adjustments detail") + 1
    assert "Sitting top-up [Sitting eligible]: 40" in str(ws.cell(row=3, column=detail_col).value)
