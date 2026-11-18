from datetime import datetime

from pydantic import BaseModel, Field

from app.models import SubjectType


class ProgrammeBase(BaseModel):
    """Base programme schema."""

    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=50)


class ProgrammeCreate(ProgrammeBase):
    """Schema for creating a programme."""

    pass


class ProgrammeUpdate(BaseModel):
    """Schema for updating a programme."""

    name: str | None = Field(None, min_length=1, max_length=255)
    code: str | None = Field(None, min_length=1, max_length=50)


class ProgrammeResponse(ProgrammeBase):
    """Schema for programme response."""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProgrammeListResponse(BaseModel):
    """Schema for paginated programme list response."""

    items: list[ProgrammeResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ProgrammeSubjectAssociation(BaseModel):
    """Schema for programme-subject association."""

    programme_id: int
    subject_id: int
    subject_type: SubjectType = Field(..., description="Subject type: CORE or ELECTIVE")
    is_compulsory: bool | None = Field(None, description="True for compulsory core subjects, False for optional core subjects, NULL for electives")
    choice_group_id: int | None = Field(None, description="Groups optional core subjects together. Subjects in the same group require selecting exactly one")


class ProgrammeSubjectResponse(BaseModel):
    """Schema for programme subject response."""

    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: SubjectType
    is_compulsory: bool | None = Field(None, description="True for compulsory core subjects, False for optional core subjects, NULL for electives")
    choice_group_id: int | None = Field(None, description="Groups optional core subjects together. Subjects in the same group require selecting exactly one")
    created_at: datetime

    class Config:
        from_attributes = True


class ProgrammeSubjectAssociationCreate(BaseModel):
    """Schema for creating a programme-subject association."""

    is_compulsory: bool | None = Field(None, description="True for compulsory core subjects, False for optional core subjects, NULL for electives")
    choice_group_id: int | None = Field(None, description="Groups optional core subjects together. Subjects in the same group require selecting exactly one")


class ProgrammeSubjectAssociationUpdate(BaseModel):
    """Schema for updating a programme-subject association."""

    is_compulsory: bool | None = Field(None, description="True for compulsory core subjects, False for optional core subjects, NULL for electives")
    choice_group_id: int | None = Field(None, description="Groups optional core subjects together. Subjects in the same group require selecting exactly one")


class SubjectChoiceGroup(BaseModel):
    """Schema for a choice group of optional core subjects."""

    choice_group_id: int
    subjects: list[ProgrammeSubjectResponse]


class ProgrammeSubjectRequirements(BaseModel):
    """Schema for programme subject requirements."""

    compulsory_core: list[ProgrammeSubjectResponse] = Field(default_factory=list, description="Compulsory core subjects")
    optional_core_groups: list[SubjectChoiceGroup] = Field(default_factory=list, description="Optional core subject groups (candidate must select exactly one per group)")
    electives: list[ProgrammeSubjectResponse] = Field(default_factory=list, description="Elective subjects")


class ProgrammeBulkUploadError(BaseModel):
    """Schema for bulk upload error details."""

    row_number: int
    error_message: str
    field: str | None = None


class ProgrammeBulkUploadResponse(BaseModel):
    """Schema for bulk upload response."""

    total_rows: int
    successful: int
    failed: int
    errors: list[ProgrammeBulkUploadError]


class SchoolProgrammeAssociation(BaseModel):
    """Schema for school-programme association."""

    school_id: int
    programme_id: int
