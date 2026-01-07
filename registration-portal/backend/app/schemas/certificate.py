from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from uuid import UUID

from app.models import (
    CertificateRequestType,
    RequestStatus,
    DeliveryMethod,
    PaymentStatus,
    ServiceType,
    TicketPriority,
    TicketActivityType,
)


class CertificateRequestBase(BaseModel):
    """Base schema for certificate request."""

    request_type: CertificateRequestType
    index_number: str = Field(..., min_length=1, max_length=50)
    exam_year: int = Field(..., ge=2000, le=2100)
    examination_center_id: int | None = None  # Optional for confirmation/verification
    national_id_number: str | None = Field(None, min_length=1, max_length=50)  # Optional for confirmation/verification
    delivery_method: DeliveryMethod | None = None  # Optional for confirmation/verification
    contact_phone: str = Field(..., min_length=1, max_length=50)
    contact_email: EmailStr | None = None
    courier_address_line1: str | None = Field(None, max_length=255)
    courier_address_line2: str | None = Field(None, max_length=255)
    courier_city: str | None = Field(None, max_length=100)
    courier_region: str | None = Field(None, max_length=100)
    courier_postal_code: str | None = Field(None, max_length=20)
    service_type: ServiceType = ServiceType.STANDARD
    # Confirmation/Verification specific fields
    candidate_name: str | None = Field(None, max_length=255)
    candidate_index_number: str | None = Field(None, min_length=1, max_length=50)
    school_name: str | None = Field(None, max_length=255)
    programme_name: str | None = Field(None, max_length=255)
    completion_year: int | None = Field(None, ge=2000, le=2100)
    certificate_file_path: str | None = None
    candidate_photograph_file_path: str | None = None
    request_details: str | None = None


class CertificateRequestCreate(CertificateRequestBase):
    """Schema for creating a certificate request."""

    pass


class CertificateRequestUpdate(BaseModel):
    """Schema for updating a certificate request."""

    status: RequestStatus | None = None
    tracking_number: str | None = Field(None, max_length=100)
    notes: str | None = None
    assigned_to_user_id: str | None = None
    priority: TicketPriority | None = None


class CertificateRequestResponse(BaseModel):
    """Schema for certificate request response."""

    id: int
    request_type: CertificateRequestType
    request_number: str
    index_number: str
    exam_year: int
    examination_center_id: int | None = None
    examination_center_name: str | None = None
    national_id_number: str | None = None
    delivery_method: DeliveryMethod | None = None
    contact_phone: str
    contact_email: str | None = None
    courier_address_line1: str | None = None
    courier_address_line2: str | None = None
    courier_city: str | None = None
    courier_region: str | None = None
    courier_postal_code: str | None = None
    status: RequestStatus
    invoice_id: int | None = None
    payment_id: int | None = None
    tracking_number: str | None = None
    notes: str | None = None
    processed_by_user_id: str | None = None
    dispatched_by_user_id: str | None = None
    dispatched_at: datetime | None = None
    assigned_to_user_id: str | None = None
    priority: TicketPriority = TicketPriority.MEDIUM
    service_type: ServiceType = ServiceType.STANDARD
    paid_at: datetime | None = None
    in_process_at: datetime | None = None
    ready_for_dispatch_at: datetime | None = None
    received_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Confirmation/Verification specific fields
    candidate_name: str | None = None
    candidate_index_number: str | None = None
    school_name: str | None = None
    programme_name: str | None = None
    completion_year: int | None = None
    certificate_file_path: str | None = None
    candidate_photograph_file_path: str | None = None
    request_details: str | None = None

    @field_validator("processed_by_user_id", "dispatched_by_user_id", "assigned_to_user_id", mode="before")
    @classmethod
    def convert_uuid_to_str(cls, v: UUID | str | None) -> str | None:
        """Convert UUID to string if needed."""
        if v is None:
            return None
        if isinstance(v, UUID):
            return str(v)
        return v

    model_config = ConfigDict(from_attributes=True)


class InvoiceResponse(BaseModel):
    """Schema for invoice response."""

    id: int
    invoice_number: str
    certificate_request_id: int | None = None
    certificate_confirmation_request_id: int | None = None
    amount: Decimal
    currency: str
    status: str
    due_date: date | None = None
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentResponse(BaseModel):
    """Schema for payment response."""

    id: int
    invoice_id: int | None = None
    certificate_request_id: int | None = None  # For certificate/attestation requests
    certificate_confirmation_request_id: int | None = None  # For confirmation requests
    paystack_reference: str | None = None
    paystack_authorization_url: str | None = None
    amount: Decimal
    currency: str
    status: PaymentStatus
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentInitializeRequest(BaseModel):
    """Schema for initializing payment."""

    request_number: str


class PaymentInitializeResponse(BaseModel):
    """Schema for payment initialization response."""

    payment_id: int
    authorization_url: str
    paystack_reference: str


class CertificateRequestPublicResponse(BaseModel):
    """Schema for public certificate request lookup (limited fields)."""

    request_number: str
    request_type: CertificateRequestType
    status: RequestStatus
    invoice: InvoiceResponse | None = None
    payment: PaymentResponse | None = None
    tracking_number: str | None = None
    created_at: datetime
    updated_at: datetime


class CertificateRequestListResponse(BaseModel):
    """Schema for paginated certificate request list."""

    items: list[CertificateRequestResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TicketActivityResponse(BaseModel):
    """Schema for ticket activity response."""

    id: int
    ticket_type: str  # "certificate_request" or "certificate_confirmation_request"
    ticket_id: int
    activity_type: TicketActivityType
    user_id: str | None = None
    user_name: str | None = None
    old_status: str | None = None
    new_status: str | None = None
    old_assigned_to: str | None = None
    new_assigned_to: str | None = None
    comment: str | None = None
    created_at: datetime

    @field_validator("user_id", "old_assigned_to", "new_assigned_to", mode="before")
    @classmethod
    def convert_uuid_to_str(cls, v: UUID | str | None) -> str | None:
        """Convert UUID to string if needed."""
        if v is None:
            return None
        if isinstance(v, UUID):
            return str(v)
        return v

    model_config = ConfigDict(from_attributes=True)


class TicketStatusHistoryResponse(BaseModel):
    """Schema for ticket status history response."""

    id: int
    ticket_type: str  # "certificate_request" or "certificate_confirmation_request"
    ticket_id: int
    from_status: str | None = None
    to_status: str
    changed_by_user_id: str | None = None
    changed_by_name: str | None = None
    reason: str | None = None
    created_at: datetime

    @field_validator("changed_by_user_id", mode="before")
    @classmethod
    def convert_uuid_to_str(cls, v: UUID | str | None) -> str | None:
        """Convert UUID to string if needed."""
        if v is None:
            return None
        if isinstance(v, UUID):
            return str(v)
        return v

    model_config = ConfigDict(from_attributes=True)


class TicketAssignmentRequest(BaseModel):
    """Schema for ticket assignment request."""

    assigned_to_user_id: str


class TicketCommentRequest(BaseModel):
    """Schema for ticket comment request."""

    comment: str = Field(..., min_length=1, max_length=5000)


# Certificate Confirmation Request Schemas

class CertificateConfirmationRequestResponse(BaseModel):
    """Schema for certificate confirmation request response. Single entry in certificate_details = single request, multiple = bulk."""

    id: int
    request_number: str
    request_type: CertificateRequestType
    contact_phone: str
    contact_email: str | None = None
    certificate_details: list[dict[str, Any]]  # JSON array of certificate details
    pdf_file_path: str | None = None
    pdf_generated_at: datetime | None = None
    pdf_generated_by_user_id: str | None = None
    # Response metadata
    response_file_path: str | None = None
    response_file_name: str | None = None
    response_mime_type: str | None = None
    response_source: str | None = None  # "upload" | "template"
    responded_at: datetime | None = None
    responded_by_user_id: str | None = None
    response_notes: str | None = None
    response_payload: dict[str, Any] | None = None
    has_response: bool = False
    invoice_id: int | None = None
    payment_id: int | None = None
    # Ticket management fields (from mixin)
    status: RequestStatus
    priority: TicketPriority = TicketPriority.MEDIUM
    service_type: ServiceType = ServiceType.STANDARD
    assigned_to_user_id: str | None = None
    processed_by_user_id: str | None = None
    dispatched_by_user_id: str | None = None
    dispatched_at: datetime | None = None
    tracking_number: str | None = None
    notes: str | None = None
    paid_at: datetime | None = None
    in_process_at: datetime | None = None
    ready_for_dispatch_at: datetime | None = None
    received_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Invoice and payment info
    invoice: InvoiceResponse | None = None
    payment: PaymentResponse | None = None

    @field_validator(
        "pdf_generated_by_user_id",
        "responded_by_user_id",
        "assigned_to_user_id",
        "processed_by_user_id",
        "dispatched_by_user_id",
        mode="before",
    )
    @classmethod
    def convert_uuid_to_str(cls, v: UUID | str | None) -> str | None:
        """Convert UUID to string if needed."""
        if v is None:
            return None
        if isinstance(v, UUID):
            return str(v)
        return v

    model_config = ConfigDict(from_attributes=True)
