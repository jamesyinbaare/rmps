"""Subject schemas for application subject selection."""
from uuid import UUID

from pydantic import BaseModel

from app.models import SubjectType


class SubjectResponse(BaseModel):
    """Subject list/response for dropdown."""

    id: UUID
    code: str
    name: str
    type: SubjectType | None = None
    description: str | None = None

    class Config:
        from_attributes = True


class SubjectTypeOption(BaseModel):
    """Subject type option for first dropdown (value + label)."""

    value: str
    label: str
