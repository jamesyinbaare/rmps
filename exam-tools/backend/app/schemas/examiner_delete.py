"""Schemas for examiner roster delete preview and confirmation."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class ExaminerManualAllocationItem(BaseModel):
    subject_code: str
    subject_name: str
    paper_number: int
    script_count: int


class ExaminerEnvelopeAssignmentItem(BaseModel):
    allocation_id: UUID
    allocation_name: str
    subject_code: str
    subject_name: str
    paper_number: int
    school_name: str
    envelope_number: int
    booklet_count: int
    run_id: UUID


class ExaminerAllocationCampaignItem(BaseModel):
    allocation_id: UUID
    allocation_name: str
    subject_code: str
    subject_name: str
    paper_number: int


class ExaminerDeleteImpactResponse(BaseModel):
    examiner_id: UUID
    examiner_name: str
    manual_allocations: list[ExaminerManualAllocationItem] = Field(default_factory=list)
    envelope_assignments: list[ExaminerEnvelopeAssignmentItem] = Field(default_factory=list)
    allocation_campaigns: list[ExaminerAllocationCampaignItem] = Field(default_factory=list)
    total_manual_scripts: int = 0
    total_envelopes: int = 0
    requires_confirmation: bool = False


class ExaminerBulkDeleteRequest(BaseModel):
    examiner_ids: list[UUID] = Field(min_length=1, max_length=500)


class ExaminerBulkDeleteRowError(BaseModel):
    examiner_id: UUID
    message: str


class ExaminerBulkDeletePreviewResponse(BaseModel):
    items: list[ExaminerDeleteImpactResponse] = Field(default_factory=list)
    requires_confirmation: bool = False
    total_manual_scripts: int = 0
    total_envelopes: int = 0
    allocation_campaign_count: int = 0
    not_found_count: int = 0


class ExaminerBulkDeleteBody(ExaminerBulkDeleteRequest):
    confirm_remove_allocations: bool = False


class ExaminerBulkDeleteResponse(BaseModel):
    deleted_count: int
    errors: list[ExaminerBulkDeleteRowError] = Field(default_factory=list)
