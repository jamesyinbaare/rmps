from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models import DataExtractionMethod


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
    scores_extraction_method: DataExtractionMethod | None = Field(
        None, description="Extraction method to add to the document's scores_extraction_methods array"
    )


class DocumentResponse(DocumentBase):
    """Schema for document response."""

    id: int
    file_path: str
    checksum: str
    uploaded_at: datetime
    school_id: int | None
    school_name: str | None = None  # School name from relationship
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
    scores_extraction_methods: list[str] | None = None
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
    scores_extraction_method: str  # Keep for backward compatibility, represents the method used in this extraction
    scores_extraction_confidence: float
    is_valid: bool
    error_message: str | None = None


class ReductoQueueRequest(BaseModel):
    """Schema for queuing documents for Reducto extraction."""

    document_ids: list[int] = Field(..., description="List of document IDs to queue for extraction")


class DocumentQueueStatus(BaseModel):
    """Schema for individual document queue status."""

    document_id: int
    queue_position: int | None = None
    status: str


class ReductoQueueResponse(BaseModel):
    """Schema for Reducto queue response."""

    queued_count: int
    documents: list[DocumentQueueStatus]
    queue_length: int


class ReductoStatusResponse(BaseModel):
    """Schema for Reducto extraction status response."""

    document_id: int
    scores_extraction_status: str | None
    scores_extraction_methods: list[str] | None = None
    scores_extraction_confidence: float | None
    scores_extracted_at: datetime | None
    queue_position: int | None = None
