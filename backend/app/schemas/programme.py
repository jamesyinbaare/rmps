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


class ProgrammeSubjectResponse(BaseModel):
    """Schema for programme subject response."""

    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: SubjectType
    created_at: datetime

    class Config:
        from_attributes = True


class SchoolProgrammeAssociation(BaseModel):
    """Schema for school-programme association."""

    school_id: int
    programme_id: int
