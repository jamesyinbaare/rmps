from pydantic import BaseModel, Field


class SchoolCreate(BaseModel):
    """Schema for creating a school."""

    code: str = Field(..., min_length=1, max_length=6)
    name: str = Field(..., min_length=1, max_length=255)


class SchoolUpdate(BaseModel):
    """Schema for updating a school."""

    name: str | None = Field(None, min_length=1, max_length=255)
    is_active: bool | None = None


class SchoolResponse(BaseModel):
    """Schema for school response."""

    id: int
    code: str
    name: str
    is_active: bool

    class Config:
        from_attributes = True
