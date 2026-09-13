"""Tests for payout override upload and CE report count compensation."""

from decimal import Decimal
from uuid import uuid4

import pandas as pd
import pytest

from app.models import (
    Examiner,
    ExaminerAllowanceType,
    ExaminerPayoutOverride,
    ExaminerRosterSource,
    ExaminerType,
    Region,
)
from app.services.examiner_compensation import MarkingDefaults, compensation_for_examiner
from app.services.examiner_payout_override_upload import read_payout_override_spreadsheet
from app.services.examiner_report_count import (
    default_report_count,
    parse_report_count_cell,
    validate_report_count_for_type,
)
from app.schemas.examiner_payout_override import (
    ExaminerPayoutAdjustmentUpdate,
    ExaminerPayoutSettingsUpdate,
)
from pydantic import ValidationError


def test_payout_settings_accepts_adjustment_replace_all() -> None:
    body = ExaminerPayoutSettingsUpdate(
        payout_adjustments=[
            ExaminerPayoutAdjustmentUpdate(
                description="Extra",
                amount_ghs=Decimal("12.50"),
                is_taxable=True,
            ),
            ExaminerPayoutAdjustmentUpdate(
                description="Untaxed top-up",
                amount_ghs=Decimal("5"),
                is_taxable=False,
            ),
        ]
    )
    assert body.payout_adjustments is not None
    assert len(body.payout_adjustments) == 2
    assert body.payout_adjustments[0].is_taxable is True
    assert body.payout_adjustments[1].amount_ghs == Decimal("5")


def test_payout_settings_empty_adjustments_clears() -> None:
    body = ExaminerPayoutSettingsUpdate(payout_adjustments=[])
    assert body.payout_adjustments == []


def test_payout_adjustment_rejects_non_positive_amount() -> None:
    with pytest.raises(ValidationError):
        ExaminerPayoutAdjustmentUpdate(description="Bad", amount_ghs=Decimal("0"), is_taxable=False)


def test_default_report_count_by_role() -> None:
    assert default_report_count(ExaminerType.CHIEF) == 1
    assert default_report_count(ExaminerType.ASSISTANT_CHIEF) == 1
    assert default_report_count(ExaminerType.TEAM_LEADER) == 1
    assert default_report_count(ExaminerType.ASSISTANT) == 0


def test_parse_report_count_defaults_and_allows_zero() -> None:
    assert parse_report_count_cell(None) == 1
    assert parse_report_count_cell("", default=0) == 0
    assert parse_report_count_cell("0") == 0
    assert parse_report_count_cell("3") == 3


def test_report_count_any_role_any_nonnegative() -> None:
    validate_report_count_for_type(0, ExaminerType.ASSISTANT)
    validate_report_count_for_type(2, ExaminerType.ASSISTANT)
    validate_report_count_for_type(2, ExaminerType.ASSISTANT_CHIEF)
    validate_report_count_for_type(2, ExaminerType.TEAM_LEADER)
    with pytest.raises(ValueError, match=">= 0"):
        validate_report_count_for_type(-1, ExaminerType.CHIEF)


def test_ce_report_count_multiplies_allowance() -> None:
    ex = Examiner(
        id=uuid4(),
        examination_id=1,
        name="Chief",
        examiner_type=ExaminerType.CHIEF,
        region=Region.GREATER_ACCRA,
        portal_token="tok",
        roster_source=ExaminerRosterSource.MANUAL,
        chief_examiners_report_count=3,
    )
    role_rates = {(ExaminerType.CHIEF, ExaminerAllowanceType.CHIEF_EXAMINERS_REPORT): Decimal("100")}
    comp = compensation_for_examiner(ex, role_rates, {}, {}, {}, {}, {}, {})
    assert comp.chief_examiners_report_ghs == Decimal("300")


def test_ce_default_one_report_is_base_rate() -> None:
    ex = Examiner(
        id=uuid4(),
        examination_id=1,
        name="Chief",
        examiner_type=ExaminerType.CHIEF,
        region=Region.GREATER_ACCRA,
        portal_token="tok-ce1",
        roster_source=ExaminerRosterSource.MANUAL,
        chief_examiners_report_count=1,
    )
    role_rates = {(ExaminerType.CHIEF, ExaminerAllowanceType.CHIEF_EXAMINERS_REPORT): Decimal("100")}
    comp = compensation_for_examiner(ex, role_rates, {}, {}, {}, {}, {}, {})
    assert comp.chief_examiners_report_ghs == Decimal("100")


def test_ae_zero_reports_pays_nothing() -> None:
    ex = Examiner(
        id=uuid4(),
        examination_id=1,
        name="AE",
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        portal_token="tok-ae0",
        roster_source=ExaminerRosterSource.MANUAL,
        chief_examiners_report_count=0,
    )
    role_rates = {(ExaminerType.ASSISTANT, ExaminerAllowanceType.CHIEF_EXAMINERS_REPORT): Decimal("50")}
    comp = compensation_for_examiner(ex, role_rates, {}, {}, {}, {}, {}, {})
    assert comp.chief_examiners_report_ghs == Decimal("0")


def test_ae_report_count_multiplies_without_flag() -> None:
    ex = Examiner(
        id=uuid4(),
        examination_id=1,
        name="Special AE",
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        portal_token="tok2",
        roster_source=ExaminerRosterSource.MANUAL,
        chief_examiners_report_count=2,
        reporting_allowance_enabled=False,
    )
    role_rates = {(ExaminerType.ASSISTANT, ExaminerAllowanceType.CHIEF_EXAMINERS_REPORT): Decimal("50")}
    comp = compensation_for_examiner(ex, role_rates, {}, {}, {}, {}, {}, {})
    assert comp.chief_examiners_report_ghs == Decimal("100")


def test_special_examiner_marking_uses_default_paper_rates() -> None:
    ex_id = uuid4()
    ex = Examiner(
        id=ex_id,
        examination_id=1,
        name="Special",
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        portal_token="tok2",
        roster_source=ExaminerRosterSource.SPECIAL,
        chief_examiners_report_count=0,
    )
    override = ExaminerPayoutOverride(
        examiner_id=ex_id,
        description="Batch A",
        paper_1_script_count=50,
        paper_2_script_count=20,
    )
    defaults = MarkingDefaults(paper_1=Decimal("2.50"), paper_2=Decimal("3.00"))
    comp = compensation_for_examiner(
        ex,
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        payout_override=override,
        marking_defaults=defaults,
    )
    assert comp.total_allocated_scripts == 70
    assert comp.marking_allowance_ghs == Decimal("185")
    assert len(comp.subject_breakdowns) == 2
    assert comp.subject_breakdowns[0].paper_number == 1
    assert comp.subject_breakdowns[1].paper_number == 2


def test_read_payout_override_spreadsheet_aliases() -> None:
    df = pd.DataFrame(
        [
            {
                "name": "Ada",
                "examiner_type": "CE",
                "region": "Greater Accra",
                "bank_code": "001",
                "account_number": "123",
                "total_allocation": 10,
                "reports": 2,
            }
        ]
    )
    bio = __import__("io").BytesIO()
    df.to_excel(bio, index=False)
    parsed = read_payout_override_spreadsheet(bio.getvalue(), "upload.xlsx")
    assert "report_count" in parsed.columns
    assert parsed.iloc[0]["report_count"] == "2"
    assert "subject_code" not in parsed.columns or pd.isna(parsed.iloc[0].get("subject_code"))


@pytest.mark.asyncio
async def test_assign_reference_code_accepts_explicit_subject_id(monkeypatch) -> None:
    """Explicit subject_id still works for special examiners when provided."""
    from unittest.mock import AsyncMock

    import app.services.examiner_reference_code as ref_mod
    from app.services.examiner_reference_code import assign_reference_code_to_examiner

    ex = Examiner(
        id=uuid4(),
        examination_id=1,
        name="Irregular",
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        portal_token="tok3",
        roster_source=ExaminerRosterSource.SPECIAL,
    )
    assert ex.subjects == []

    session = AsyncMock()

    async def fake_ensure(session, examination_id):
        return False

    async def fake_set(session, examiner, *, subject_id=None):
        assert subject_id == 7
        examiner.reference_code = "MATH301-NAE1"
        return "MATH301-NAE1"

    monkeypatch.setattr(ref_mod, "ensure_default_region_groups", fake_ensure)
    monkeypatch.setattr(ref_mod, "_set_reference_code_on_examiner", fake_set)

    code = await assign_reference_code_to_examiner(session, ex, subject_id=7)
    assert code == "MATH301-NAE1"


@pytest.mark.asyncio
async def test_assign_reference_code_special_without_subject(monkeypatch) -> None:
    """Special examiners with no subjects get SPEC-{region}{role}{seq} codes."""
    from unittest.mock import AsyncMock

    import app.services.examiner_reference_code as ref_mod
    from app.services.examiner_reference_code import (
        SPECIAL_REFERENCE_PREFIX,
        assign_reference_code_to_examiner,
    )

    ex = Examiner(
        id=uuid4(),
        examination_id=1,
        name="Special No Subject",
        examiner_type=ExaminerType.ASSISTANT,
        region=Region.GREATER_ACCRA,
        portal_token="tok4",
        roster_source=ExaminerRosterSource.SPECIAL,
    )
    assert ex.subjects == []

    session = AsyncMock()

    async def fake_ensure(session, examination_id):
        return False

    async def fake_with_prefix(session, examination_id, region, examiner_type, subject_prefix):
        assert subject_prefix == SPECIAL_REFERENCE_PREFIX
        assert examination_id == 1
        return "SPEC-SAE1"

    monkeypatch.setattr(ref_mod, "ensure_default_region_groups", fake_ensure)
    monkeypatch.setattr(ref_mod, "assign_reference_code_with_prefix", fake_with_prefix)

    code = await assign_reference_code_to_examiner(session, ex)
    assert code == "SPEC-SAE1"
    assert ex.reference_code == "SPEC-SAE1"
