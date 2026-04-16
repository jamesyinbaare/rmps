import pytest
from pydantic import ValidationError

from app.schemas.script_allocation import AllocationCreate, AllocationScopeSchema, AllocationSolveOptions


def test_allocation_create_requires_subject_and_paper() -> None:
    with pytest.raises(ValidationError):
        AllocationCreate(examination_id=1)


def test_allocation_create_accepts_required_fields() -> None:
    row = AllocationCreate(examination_id=1, name="A", subject_id=101, paper_number=2)
    assert row.subject_id == 101
    assert row.paper_number == 2


def test_allocation_create_name_optional() -> None:
    row = AllocationCreate(examination_id=1, subject_id=101, paper_number=2)
    assert row.name is None
    assert row.subject_id == 101


def test_allocation_solve_options_defaults_include_fairness_and_scope() -> None:
    opts = AllocationSolveOptions()
    assert opts.allocation_scope == AllocationScopeSchema.zone
    assert opts.enforce_single_series_per_examiner is True
    assert opts.exclude_home_zone_or_region is True
    assert opts.fairness_weight >= 0
