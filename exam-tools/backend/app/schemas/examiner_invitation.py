from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.script_allocation import ExaminerTypeSchema


class ExaminerInvitationStatusSchema(str, Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"
    expired = "expired"


class ExaminerInvitationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    phone_number: str = Field(min_length=1, max_length=50)
    subject_id: int
    examiner_type: ExaminerTypeSchema
    region: str = Field(min_length=1)
    send_sms: bool | None = None
    response_deadline: datetime
    coordination_date: datetime | None = None


class ExaminerInvitationResponse(BaseModel):
    id: UUID
    examination_id: int
    subject_id: int
    subject_name: str
    subject_code: str
    subject_original_code: str | None = None
    subject_type: str
    name: str
    phone_number: str
    examiner_type: ExaminerTypeSchema
    region: str
    status: ExaminerInvitationStatusSchema
    invited_by_user_id: UUID | None
    notified_at: datetime | None
    responded_at: datetime | None
    response_deadline: datetime
    coordination_date: datetime | None
    examiner_id: UUID | None
    created_at: datetime
    updated_at: datetime
    sms_sent: bool | None = None
    sms_error: str | None = None
    sms_delivery_id: UUID | None = None

    model_config = {"from_attributes": True}


class ExaminerInvitationPublicResponse(BaseModel):
    invitee_name: str
    phone_number: str
    examination_name: str
    examination_description: str | None
    subject_name: str
    subject_code: str
    subject_original_code: str | None = None
    examiner_type: str
    examiner_type_label: str
    region: str
    status: ExaminerInvitationStatusSchema
    response_deadline: datetime
    coordination_date: datetime | None
    responded_at: datetime | None
    can_respond: bool
    examiner_id: UUID | None = None


class ExaminerInvitationActionResponse(BaseModel):
    status: ExaminerInvitationStatusSchema
    message: str
    examiner_id: UUID | None = None


class ExaminerInvitationResendResponse(BaseModel):
    sms_sent: bool
    sms_error: str | None = None
    sms_delivery_id: UUID | None = None


class ExaminerInvitationBulkImportRowError(BaseModel):
    row_number: int
    message: str


class ExaminerInvitationBulkImportResponse(BaseModel):
    created_count: int
    sms_sent_count: int
    sms_failed_count: int
    errors: list[ExaminerInvitationBulkImportRowError]


class ExaminerInvitationBulkSmsRequest(BaseModel):
    invitation_ids: list[UUID] = Field(min_length=1, max_length=500)
    message: str = Field(min_length=1, max_length=640)


class ExaminerInvitationBulkSmsRowError(BaseModel):
    invitation_id: UUID
    message: str


class ExaminerInvitationBulkSmsResponse(BaseModel):
    sent_count: int
    failed_count: int
    errors: list[ExaminerInvitationBulkSmsRowError]


class ExaminerInvitationCoordinationUpdate(BaseModel):
    coordination_date: datetime | None = None


class ExaminerInvitationBulkCoordinationUpdate(BaseModel):
    invitation_ids: list[UUID] = Field(min_length=1, max_length=500)
    coordination_date: datetime


class ExaminerInvitationBulkCoordinationResponse(BaseModel):
    updated_count: int
    errors: list[ExaminerInvitationBulkSmsRowError]
