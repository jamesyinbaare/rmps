"""Schemas for credit management."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CreditBalanceResponse(BaseModel):
    """Schema for credit balance response."""

    balance: Decimal
    total_purchased: Decimal
    total_used: Decimal

    class Config:
        from_attributes = True


class CreditPurchaseRequest(BaseModel):
    """Schema for credit purchase request."""

    amount: int = Field(..., ge=10, description="Number of credits to purchase (minimum 10)")
    payment_method: str = Field(default="paystack", description="Payment method")


class CreditPurchaseResponse(BaseModel):
    """Schema for credit purchase response."""

    payment_url: Optional[str] = None
    payment_reference: Optional[str] = None
    amount: Decimal
    credits: int
    message: str


class CreditAssignmentRequest(BaseModel):
    """Schema for admin credit assignment request."""

    user_id: Optional[UUID] = None  # Optional, can be in URL path
    amount: int = Field(..., ge=1, description="Number of credits to assign")
    description: Optional[str] = Field(None, max_length=500, description="Optional description for the assignment")


class CreditAssignmentResponse(BaseModel):
    """Schema for credit assignment response."""

    user_id: UUID
    user_email: str
    user_name: str
    amount: int
    new_balance: Decimal
    message: str


class CreditTransactionResponse(BaseModel):
    """Schema for credit transaction response."""

    id: int
    transaction_type: str
    amount: Decimal
    balance_after: Decimal
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CreditTransactionListResponse(BaseModel):
    """Schema for paginated credit transaction list."""

    transactions: list[CreditTransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
