from pydantic import BaseModel


class IDExtractionRequest(BaseModel):
    """Schema for ID extraction request."""

    force_ocr: bool = False  # Force OCR even if barcode is available


class IDExtractionResponse(BaseModel):
    """Schema for ID extraction response."""

    extracted_id: str | None
    method: str | None  # barcode, ocr, manual
    confidence: float
    is_valid: bool
    school_id: int | None
    subject_id: int | None
    school_code: str | None
    subject_code: str | None
    test_type: str | None
    sheet_number: str | None
    error_message: str | None


class IDValidationResult(BaseModel):
    """Schema for ID validation result."""

    is_valid: bool
    school_code: str | None
    subject_code: str | None
    test_type: str | None
    sheet_number: str | None
    error_message: str | None
