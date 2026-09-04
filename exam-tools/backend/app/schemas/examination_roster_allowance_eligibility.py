"""Schemas for roster-source allowance eligibility."""

from pydantic import BaseModel, Field


class RosterAllowanceEligibilityRow(BaseModel):
    roster_source: str
    label: str
    allowances: dict[str, bool]


class ExaminationRosterAllowanceEligibilityResponse(BaseModel):
    rows: list[RosterAllowanceEligibilityRow]


class RosterAllowanceEligibilityCell(BaseModel):
    roster_source: str
    allowance_key: str
    enabled: bool


class ExaminationRosterAllowanceEligibilityPut(BaseModel):
    cells: list[RosterAllowanceEligibilityCell] = Field(default_factory=list)
