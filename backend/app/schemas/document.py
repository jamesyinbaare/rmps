from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DocumentBase(BaseModel):
    """Base document schema."""

    file_name: str
    mime_type: str
    file_size: int


class DocumentCreate(DocumentBase):
    """Schema for creating a document."""

    pass


class DocumentUpdate(BaseModel):
    """Schema for updating a document."""

    school_id: int | None = None
    subject_id: int | None = None
    exam_id: int | None = None
    test_type: str | None = None
    subject_series: str | None = None
    sheet_number: str | None = None
    extracted_id: str | None = None
    id_extraction_method: str | None = None
    id_extraction_confidence: float | None = None
    id_extraction_status: str | None = None


class DocumentResponse(DocumentBase):
    """Schema for document response."""

    id: int
    file_path: str
    checksum: str
    uploaded_at: datetime
    school_id: int | None
    subject_id: int | None
    exam_id: int
    test_type: str | None
    subject_series: str | None
    sheet_number: str | None
    extracted_id: str | None
    id_extraction_method: str | None
    id_extraction_confidence: float | None
    id_extraction_status: str
    id_extracted_at: datetime | None = None
    scores_extraction_data: dict[str, Any] | None = None
    scores_extraction_status: str | None = None
    scores_extraction_method: str | None = None
    scores_extraction_confidence: float | None = None
    scores_extracted_at: datetime | None = None

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Schema for paginated document list."""

    items: list[DocumentResponse]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total_pages: int


class BulkUploadResponse(BaseModel):
    """Schema for bulk upload response."""

    total: int  # Total files in request
    successful: int  # Successfully uploaded files
    failed: int  # Failed uploads
    skipped: int  # Skipped files (duplicates, invalid, etc.)
    document_ids: list[int]  # IDs of successfully uploaded documents


class ContentExtractionResponse(BaseModel):
    """Schema for content extraction response."""

    scores_extraction_data: dict[str, Any]
    scores_extraction_method: str
    scores_extraction_confidence: float
    is_valid: bool
    error_message: str | None = None
