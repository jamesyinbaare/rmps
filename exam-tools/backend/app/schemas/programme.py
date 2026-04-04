from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models import SubjectType


class ProgrammeBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=50)


class ProgrammeCreate(ProgrammeBase):
    pass


class ProgrammeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, min_length=1, max_length=50)


class ProgrammeResponse(ProgrammeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class ProgrammeListResponse(BaseModel):
    items: list[ProgrammeResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProgrammeSubjectAssociation(BaseModel):
    programme_id: int
    subject_id: int
    subject_type: SubjectType = Field(..., description="Subject type: CORE or ELECTIVE")
    is_compulsory: bool | None = None
    choice_group_id: int | None = None


class ProgrammeSubjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: SubjectType
    is_compulsory: bool | None = None
    choice_group_id: int | None = None
    created_at: datetime


class ProgrammeSubjectAssociationCreate(BaseModel):
    is_compulsory: bool | None = None
    choice_group_id: int | None = None


class ProgrammeSubjectAssociationUpdate(BaseModel):
    is_compulsory: bool | None = None
    choice_group_id: int | None = None


class SubjectChoiceGroup(BaseModel):
    choice_group_id: int
    subjects: list[ProgrammeSubjectResponse]


class ProgrammeSubjectRequirements(BaseModel):
    compulsory_core: list[ProgrammeSubjectResponse] = Field(default_factory=list)
    optional_core_groups: list[SubjectChoiceGroup] = Field(default_factory=list)
    electives: list[ProgrammeSubjectResponse] = Field(default_factory=list)


class ProgrammeBulkUploadError(BaseModel):
    row_number: int
    error_message: str
    field: str | None = None


class ProgrammeBulkUploadResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: list[ProgrammeBulkUploadError]


class SchoolProgrammeAssociation(BaseModel):
    school_id: UUID
    programme_id: int
