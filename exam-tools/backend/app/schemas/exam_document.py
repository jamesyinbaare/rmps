from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ExamDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    original_filename: str
    size_bytes: int
    created_at: datetime


class ExamDocumentListResponse(BaseModel):
    items: list[ExamDocumentResponse]
    total: int
