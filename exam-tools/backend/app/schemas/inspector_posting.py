"""API schemas for inspector examination postings (admin CRUD + inspector my-postings)."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class ExamInspectorSubjectScopeApi(str, Enum):
    ALL = "ALL"
    CORE = "CORE"
    ELECTIVE = "ELECTIVE"


class InspectorExamPostingCreate(BaseModel):
    inspector_user_id: UUID
    center_id: UUID
    subject_scope: ExamInspectorSubjectScopeApi
    notes: str | None = Field(None, max_length=2000)


class InspectorExamPostingUpdate(BaseModel):
    center_id: UUID | None = None
    subject_scope: ExamInspectorSubjectScopeApi | None = None
    notes: str | None = Field(None, max_length=2000)


class InspectorExamPostingResponse(BaseModel):
    id: UUID
    examination_id: int
    inspector_user_id: UUID
    inspector_full_name: str
    inspector_phone_number: str | None = None
    center_id: UUID
    center_code: str
    center_name: str
    subject_scope: str
    notes: str | None
    created_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime


class InspectorExamPostingListResponse(BaseModel):
    items: list[InspectorExamPostingResponse]


class MyInspectorPostingRow(BaseModel):
    id: UUID
    center_id: UUID
    center_code: str
    center_name: str
    subject_scope: str


class MyInspectorPostingsResponse(BaseModel):
    items: list[MyInspectorPostingRow]


class InspectorPostingBulkUploadError(BaseModel):
    row_number: int
    error_message: str


class InspectorPostingBulkCreatedInspectorRow(BaseModel):
    row_number: int
    phone_number: str
    full_name: str
    sms_sent: bool | None = None
    sms_error: str | None = None


class InspectorPostingBulkCreatedPostingRow(BaseModel):
    row_number: int
    inspector_user_id: UUID
    center_code: str
    subject_scope: str


class InspectorPostingBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[InspectorPostingBulkUploadError]
    created_inspectors: list[InspectorPostingBulkCreatedInspectorRow] = []
    created_postings: list[InspectorPostingBulkCreatedPostingRow] = []
