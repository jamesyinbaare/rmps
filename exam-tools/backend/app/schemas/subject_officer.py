from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SubjectOfficerCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    phone_number: str | None = Field(default=None, max_length=50)
    send_sms: bool | None = None


class SubjectOfficerCreatedResponse(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
    phone_number: str | None = None
    sms_sent: bool | None = None
    sms_error: str | None = None


class SubjectOfficerRow(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr | None = None
    phone_number: str | None = None


class SubjectOfficerListResponse(BaseModel):
    items: list[SubjectOfficerRow]
    total: int


class SubjectOfficerAssignmentSubjectRow(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: str


class SubjectOfficerAssignmentRow(BaseModel):
    id: UUID
    user_id: UUID
    full_name: str
    email: EmailStr | None = None
    phone_number: str | None
    subject_ids: list[int]
    subjects: list[SubjectOfficerAssignmentSubjectRow]


class SubjectOfficerAssignmentListResponse(BaseModel):
    items: list[SubjectOfficerAssignmentRow]


class SubjectOfficerAssignmentUpsert(BaseModel):
    user_id: UUID
    subject_ids: list[int] = Field(..., min_length=1)


class SubjectOfficerMeAssignmentSubject(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: str
    subject_original_code: str | None = None


class SubjectOfficerMeExamAssignment(BaseModel):
    examination_id: int
    examination_name: str
    subjects: list[SubjectOfficerMeAssignmentSubject]


class SubjectOfficerMeAssignmentsResponse(BaseModel):
    items: list[SubjectOfficerMeExamAssignment]


class MarkedScriptReturnStatusSchema(str, Enum):
    pending = "pending"
    partial = "partial"
    complete = "complete"
    verified = "verified"


class MarkedScriptReturnRow(BaseModel):
    examiner_id: UUID
    examiner_name: str
    examiner_type: str
    paper_number: int
    allocation_run_id: UUID
    expected_booklets: int
    returned_booklets: int | None
    status: str
    verified_at: datetime | None
    notes: str | None


class MarkedScriptReturnGridResponse(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    rows: list[MarkedScriptReturnRow]
    summary: dict[str, int]


class MarkedScriptReturnUpsert(BaseModel):
    returned_booklets: int = Field(..., ge=0)
    notes: str | None = None


class MarkedScriptReturnVerify(BaseModel):
    notes: str | None = None
    allow_mismatch: bool = False


class MarkedScriptReturnRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    examination_id: int
    subject_id: int
    examiner_id: UUID
    paper_number: int
    allocation_run_id: UUID
    expected_booklets: int
    returned_booklets: int | None
    verified_at: datetime | None
    notes: str | None
