from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class BatchBase(BaseModel):
    """Base batch schema."""

    name: str = Field(..., min_length=1, max_length=255)


class BatchCreate(BatchBase):
    """Schema for creating a batch."""

    document_ids: list[int] = Field(default_factory=list)


class BatchResponse(BatchBase):
    """Schema for batch response."""

    id: int
    status: str
    total_files: int
    processed_files: int
    failed_files: int
    created_at: datetime
    completed_at: datetime | None

    class Config:
        from_attributes = True


class BatchStatus(str):
    """Batch status values."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class BatchDocumentStatus(BaseModel):
    """Schema for batch document status."""

    document_id: int
    processing_status: str
    error_message: str | None


class BatchReport(BaseModel):
    """Schema for batch processing report."""

    batch_id: int
    batch_name: str
    status: str
    total_files: int
    processed_files: int
    failed_files: int
    documents: list[BatchDocumentStatus]
    validation_errors: list[str]
    sequence_gaps: list[dict[str, Any]]  # List of gaps per school+subject+test_type
    duplicates: list[dict[str, Any]]  # List of duplicate sheet numbers
