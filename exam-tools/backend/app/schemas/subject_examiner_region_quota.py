from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.script_allocation import ExaminerTypeSchema


class SubjectExaminerRegionQuotaItem(BaseModel):
    group_id: UUID
    examiner_type: ExaminerTypeSchema | None = None
    quota_count: int = Field(ge=0)


class SubjectExaminerRegionQuotaReplace(BaseModel):
    total_quota: int | None = Field(default=None, ge=0)
    male_quota: int | None = Field(default=None, ge=0)
    female_quota: int | None = Field(default=None, ge=0)
    items: list[SubjectExaminerRegionQuotaItem] = Field(default_factory=list)


class SubjectExaminerRegionQuotaSummaryRow(BaseModel):
    group_id: UUID
    group_name: str
    examiner_type: ExaminerTypeSchema | None = None
    examiner_type_label: str
    current_count: int
    quota: int | None = None
    remaining: int | None = None


class SubjectExaminerGenderQuotaSummaryRow(BaseModel):
    gender: str
    gender_label: str
    current_count: int
    quota: int | None = None
    remaining: int | None = None


class SubjectExaminerRegionBreakdownRow(BaseModel):
    region: str
    group_id: UUID
    group_name: str
    group_quota: int | None = None
    group_current_count: int = 0
    group_combined_count: int = 0
    group_over_cap: bool = False
    current_count: int = 0
    proposed_count: int = 0
    combined_count: int = 0
    share_of_group_percent: float | None = None


class SubjectExaminerRegionQuotasResponse(BaseModel):
    examination_id: int
    subject_id: int
    total_quota: int | None = None
    male_quota: int | None = None
    female_quota: int | None = None
    roster_total: int = 0
    groups: list[dict]
    summary: list[SubjectExaminerRegionQuotaSummaryRow]
    gender_summary: list[SubjectExaminerGenderQuotaSummaryRow] = Field(default_factory=list)
    region_breakdown: list[SubjectExaminerRegionBreakdownRow] = Field(default_factory=list)
    items: list[SubjectExaminerRegionQuotaItem]


class QuotaAssessmentRowError(BaseModel):
    row_number: int
    message: str


class QuotaAssessmentSummaryRow(BaseModel):
    group_id: str
    group_name: str
    examiner_type: str | None = None
    examiner_type_label: str
    current_count: int
    proposed_count: int
    combined_count: int
    quota: int | None = None
    quota_percent: float | None = None
    remaining: int | None = None
    over_cap: bool


class QuotaAssessmentGenderSummaryRow(BaseModel):
    gender: str
    gender_label: str
    current_count: int
    proposed_count: int
    combined_count: int
    quota: int | None = None
    quota_percent: float | None = None
    remaining: int | None = None
    over_cap: bool


class QuotaAssessmentResponse(BaseModel):
    valid: bool
    violations: list[str]
    row_errors: list[QuotaAssessmentRowError]
    summary_by_group: list[QuotaAssessmentSummaryRow]
    summary_by_gender: list[QuotaAssessmentGenderSummaryRow] = Field(default_factory=list)
    proposed_count: int


class QuotaInvitationBreakdown(BaseModel):
    pending: int = 0
    quota_waitlisted: int = 0


class QuotaProjectionResponse(QuotaAssessmentResponse):
    examination_id: int
    subject_id: int
    scenario: str
    invitation_count: int
    invitation_breakdown: QuotaInvitationBreakdown
    total_quota: int | None = None
    roster_total: int = 0
    combined_roster_total: int = 0
    subject_over_cap: bool = False
    region_breakdown: list[SubjectExaminerRegionBreakdownRow] = Field(default_factory=list)
