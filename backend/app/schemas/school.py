from datetime import datetime

from pydantic import BaseModel, Field

from app.models import SchoolRegion, SchoolType, SchoolZone


class SchoolBase(BaseModel):
    """Base school schema."""

    code: str = Field(..., min_length=6, max_length=6)
    name: str = Field(..., min_length=1, max_length=255)


class SchoolCreate(SchoolBase):
    """Schema for creating a school."""

    region: SchoolRegion | None = None
    zone: SchoolZone | None = None
    school_type: SchoolType | None = None


class SchoolUpdate(BaseModel):
    """Schema for updating a school."""

    name: str | None = Field(None, min_length=1, max_length=255)
    region: SchoolRegion | None = None
    zone: SchoolZone | None = None
    school_type: SchoolType | None = None


class SchoolResponse(SchoolBase):
    """Schema for school response."""

    id: int
    region: SchoolRegion | None = None
    zone: SchoolZone | None = None
    school_type: SchoolType | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SchoolStatistics(BaseModel):
    """Schema for school statistics."""

    school_id: int
    school_code: str
    school_name: str
    total_documents: int
    total_subjects: int
    documents_by_test_type: dict[str, int]  # "1" or "2" -> count


class SchoolSubjectAssociation(BaseModel):
    """Schema for school-subject association."""

    school_id: int
    subject_id: int
