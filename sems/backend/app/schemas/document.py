from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import DataExtractionMethod


class ScoreExtractionItem(BaseModel):
    """Per-provider extraction status on a document (list payload, no blob)."""

    provider: str
    status: str
    confidence: float | None = None
    extracted_at: datetime | None = None
    applied_at: datetime | None = None
    applied_count: int | None = None
    unmatched_count: int | None = None
    current_applied: bool = False
    error_message: str | None = None


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
    subject_code: str | None = None
    subject_name: str | None = None
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
    id_extraction_conflict_document_id: int | None = None
    id_extracted_at: datetime | None = None
    scores_extraction_data: dict[str, Any] | None = None
    scores_extraction_provider: str | None = None
    scores_extraction_status: str | None = None
    scores_extraction_methods: list[str] | None = None
    scores_extraction_confidence: float | None = None
    scores_extracted_at: datetime | None = None
    scores_applied_at: datetime | None = None
    scores_applied_count: int | None = None
    scores_unmatched_count: int | None = None
    test_type_changed_at: datetime | None = None
    test_type_changed_from: str | None = None
    extractions: list[ScoreExtractionItem] = Field(default_factory=list)

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
    subject_code: str | None = None
    subject_name: str | None = None
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
    id_extraction_conflict_document_id: int | None = None
    id_extracted_at: datetime | None = None
    scores_extraction_status: str | None = None
    scores_extraction_provider: str | None = None
    scores_extraction_methods: list[str] | None = None
    scores_extraction_confidence: float | None = None
    scores_extracted_at: datetime | None = None
    scores_applied_at: datetime | None = None
    scores_applied_count: int | None = None
    scores_unmatched_count: int | None = None
    test_type_changed_at: datetime | None = None
    test_type_changed_from: str | None = None
    extractions: list[ScoreExtractionItem] = Field(default_factory=list)

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Schema for paginated document list."""

    items: list[DocumentListItem]
    total: int
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=1000)
    total_pages: int


class ScoresExtractionStatusCounts(BaseModel):
    """Aggregate counts of documents by scores_extraction_status for current filters."""

    total: int = 0
    pending: int = 0
    queued: int = 0
    processing: int = 0
    success: int = 0
    error: int = 0
    needs_id: int = 0


class IdExtractionErrorCodeCount(BaseModel):
    code: str
    count: int


class IdExtractionStatusCounts(BaseModel):
    """Aggregate counts of documents by ID extraction status for current filters."""

    total: int = 0
    pending: int = 0
    success: int = 0
    error: int = 0
    error_codes: list[IdExtractionErrorCodeCount] = Field(default_factory=list)


class BulkDocumentIdsRequest(BaseModel):
    """Request body for bulk document operations."""

    document_ids: list[int] = Field(..., min_length=1)


class BulkDeleteResponse(BaseModel):
    """Response for bulk document delete."""

    deleted: int
    failed: int
    errors: list[dict[str, str]] = Field(default_factory=list)


class BulkReclassifyPaperRequest(BaseModel):
    """Request body for bulk paper (test_type) reclassify."""

    document_ids: list[int] = Field(..., min_length=1)
    target_test_type: str = Field(..., pattern="^[12]$", description="1=Objectives, 2=Essay")


class BulkReclassifyPaperItem(BaseModel):
    document_id: int
    old_extracted_id: str | None = None
    new_extracted_id: str | None = None
    old_test_type: str | None = None
    new_test_type: str | None = None
    scores_moved: int = 0
    error: str | None = None


class BulkReclassifyPaperResponse(BaseModel):
    updated: int
    failed: int
    scores_moved: int = 0
    results: list[BulkReclassifyPaperItem] = Field(default_factory=list)


class BulkExtractIdResponse(BaseModel):
    """Response for bulk ID re-extraction."""

    queued: int
    document_ids: list[int]


class DocumentExamFacet(BaseModel):
    """Exam that has uploaded documents, with count."""

    id: int
    exam_type: str
    series: str
    year: int
    description: str | None = None
    document_count: int


class DocumentSchoolFacet(BaseModel):
    """School that has uploaded documents for an exam."""

    id: int
    name: str
    code: str
    document_count: int


class DocumentSubjectFacet(BaseModel):
    """Subject that has uploaded documents for an exam(+school)."""

    id: int
    name: str
    code: str
    document_count: int


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
    """Schema for queuing documents for structured extraction."""

    document_ids: list[int] = Field(..., description="List of document IDs to queue for extraction")
    require_extracted_id: bool = Field(
        default=True,
        description="If True, skip documents that have no extracted_id",
    )
    method: Literal["reducto", "llama"] = Field(
        default="llama",
        description="Extraction provider: 'reducto' or 'llama'",
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


class ReductoDequeueRequest(BaseModel):
    """Schema for removing documents from the structured extraction queue."""

    document_ids: list[int] = Field(..., description="List of document IDs to remove from the queue")
    method: Literal["reducto", "llama"] = Field(
        default="llama",
        description="Extraction provider: 'reducto' or 'llama'",
    )


class ReductoDequeueResponse(BaseModel):
    """Schema for dequeue response."""

    removed_count: int
    skipped_processing: int = 0
    skipped_not_queued: int = 0
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


class ReductoQueueStatusResponse(BaseModel):
    """Schema for Reducto worker pool / queue status."""

    queue_length: int
    active_workers: int
    target_workers: int
    processing_documents: list[int]
    total_workers: int
    rate_limit_per_second: float
    workers_max: int


class ReductoWorkersUpdateRequest(BaseModel):
    """Schema for resizing Reducto concurrent document workers."""

    workers: int = Field(
        ...,
        ge=1,
        description="Number of documents to process concurrently (capped by workers_max)",
    )


class BackfillTestTypeResponse(BaseModel):
    """Response schema for backfill operation."""

    total_found: int  # Total documents with extracted_id but missing fields
    updated: int  # Successfully updated documents
    failed: int  # Documents that failed to update
    skipped: int  # Documents skipped (invalid extracted_id, validation failed, etc.)
    errors: list[dict[str, str]]  # List of errors with document_id and error message


class IdExtractionConflictItem(BaseModel):
    """Slim conflicting document for duplicate ID resolution."""

    id: int
    extracted_id: str | None = None
    file_name: str
    uploaded_at: datetime
    id_extraction_status: str
    mime_type: str | None = None
    file_size: int | None = None

    class Config:
        from_attributes = True


class IdExtractionConflictsResponse(BaseModel):
    items: list[IdExtractionConflictItem]
