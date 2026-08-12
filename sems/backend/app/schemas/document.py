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
    upload_status: str = "uploaded"
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
    id_extraction_error: str | None = None
    id_extraction_error_code: str | None = None
    id_extracted_at: datetime | None = None
    scores_extraction_data: dict[str, Any] | None = None
    scores_extraction_status: str | None = None
    scores_extraction_methods: list[str] | None = None
    scores_extraction_confidence: float | None = None
    scores_extracted_at: datetime | None = None
    scores_applied_at: datetime | None = None
    scores_applied_count: int | None = None
    scores_unmatched_count: int | None = None

    class Config:
        from_attributes = True


class DocumentListItem(DocumentBase):
    """Slim document schema for list endpoints (omits scores_extraction_data)."""

    id: int
    file_path: str
    checksum: str
    upload_status: str = "uploaded"
    uploaded_at: datetime
    school_id: int | None
    school_name: str | None = None
    subject_id: int | None
    exam_id: int
    test_type: str | None
    subject_series: str | None
    sheet_number: str | None
    extracted_id: str | None
    id_extraction_method: str | None
    id_extraction_confidence: float | None
    id_extraction_status: str
    id_extraction_error: str | None = None
    id_extraction_error_code: str | None = None
    id_extracted_at: datetime | None = None
    scores_extraction_status: str | None = None
    scores_extraction_methods: list[str] | None = None
    scores_extraction_confidence: float | None = None
    scores_extracted_at: datetime | None = None
    scores_applied_at: datetime | None = None
    scores_applied_count: int | None = None
    scores_unmatched_count: int | None = None

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Schema for paginated document list."""

    items: list[DocumentListItem]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=1000)
    total_pages: int


class BulkUploadResponse(BaseModel):
    """Schema for bulk upload response."""

    total: int  # Total files in request
    successful: int  # Successfully uploaded files
    failed: int  # Failed uploads
    skipped: int  # Skipped files (duplicates, invalid, etc.)
    document_ids: list[int]  # IDs of successfully uploaded documents


class UploadInitiateFile(BaseModel):
    """Metadata for one file in a direct-upload initiate batch."""

    file_name: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., min_length=1, max_length=100)
    file_size: int = Field(..., gt=0)
    checksum: str = Field(..., min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")


class UploadInitiateRequest(BaseModel):
    """Request body for initiating direct-to-storage uploads."""

    exam_id: int
    files: list[UploadInitiateFile] = Field(..., min_length=1)


class UploadSlot(BaseModel):
    """One minted upload slot (pending document + PUT target)."""

    document_id: int
    file_name: str
    checksum: str
    upload_url: str
    headers: dict[str, str]


class UploadInitiateSkipped(BaseModel):
    file_name: str
    reason: str
    existing_document_id: int | None = None


class UploadInitiateFailed(BaseModel):
    file_name: str
    error: str


class UploadInitiateResponse(BaseModel):
    total: int
    initiated: int
    skipped: int
    failed: int
    uploads: list[UploadSlot]
    skipped_files: list[UploadInitiateSkipped]
    failed_files: list[UploadInitiateFailed]


class UploadConfirmRequest(BaseModel):
    """Confirm that client PUT(s) completed; backend verifies object existence."""

    document_ids: list[int] = Field(..., min_length=1)


class UploadConfirmItem(BaseModel):
    document_id: int
    status: str  # confirmed | already_uploaded | failed
    error: str | None = None


class UploadConfirmResponse(BaseModel):
    total: int
    confirmed: int
    failed: int
    results: list[UploadConfirmItem]


class AbandonedUploadCleanupResponse(BaseModel):
    deleted: int
    errors: list[str] = Field(default_factory=list)

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
    require_extracted_id: bool = Field(
        default=True,
        description="If True, skip documents that have no extracted_id",
    )


class DocumentQueueStatus(BaseModel):
    """Schema for individual document queue status."""

    document_id: int
    queue_position: int | None = None
    status: str


class ReductoQueueResponse(BaseModel):
    """Schema for Reducto queue response."""

    queued_count: int
    skipped_count: int = 0
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


class BackfillTestTypeResponse(BaseModel):
    """Response schema for backfill operation."""

    total_found: int  # Total documents with extracted_id but missing fields
    updated: int  # Successfully updated documents
    failed: int  # Documents that failed to update
    skipped: int  # Documents skipped (invalid extracted_id, validation failed, etc.)
    errors: list[dict[str, str]]  # List of errors with document_id and error message
