"""Schemas for API verification endpoints."""
from typing import Union

from pydantic import BaseModel, Field

from app.schemas.result import PublicResultCheckRequest, PublicResultResponse


class BulkVerificationRequest(BaseModel):
    """Schema for bulk verification request."""

    items: list[PublicResultCheckRequest] = Field(..., min_length=1, max_length=100, description="List of verification requests (max 100)")


class VerificationItemResponse(BaseModel):
    """Schema for individual verification result in bulk response."""

    success: bool
    request: PublicResultCheckRequest
    result: PublicResultResponse | None = None
    error: str | None = None


class BulkVerificationResponse(BaseModel):
    """Schema for bulk verification response."""

    total: int
    successful: int
    failed: int
    results: list[VerificationItemResponse]


# Union type for unified endpoint that accepts both single and bulk
VerificationRequest = Union[PublicResultCheckRequest, BulkVerificationRequest]
