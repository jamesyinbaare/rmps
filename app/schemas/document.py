from datetime import datetime

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
    test_type: str | None = None
    sheet_number: str | None = None
    extracted_id: str | None = None
    extraction_method: str | None = None
    extraction_confidence: float | None = None
    status: str | None = None


class DocumentResponse(DocumentBase):
    """Schema for document response."""

    id: int
    file_path: str
    checksum: str
    uploaded_at: datetime
    school_id: int | None
    subject_id: int | None
    test_type: str | None
    sheet_number: str | None
    extracted_id: str | None
    extraction_method: str | None
    extraction_confidence: float | None
    status: str

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
