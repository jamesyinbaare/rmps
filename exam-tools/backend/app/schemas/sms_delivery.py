from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SmsDeliveryRow(BaseModel):
    id: UUID
    user_id: UUID | None
    recipient_full_name: str
    phone_number: str
    msisdn: str
    message_type: str
    trigger: str
    status: str
    error_message: str | None
    provider: str
    retried_from_id: UUID | None
    triggered_by_user_id: UUID | None
    created_at: datetime
    sent_at: datetime | None


class SmsDeliveryListResponse(BaseModel):
    items: list[SmsDeliveryRow]
    total: int


class SmsDeliveryRetry(BaseModel):
    mode: Literal["auto", "manual"]
    new_password: str | None = Field(None, min_length=8)

    @model_validator(mode="after")
    def validate_manual_password(self) -> Self:
        if self.mode == "manual" and not self.new_password:
            raise ValueError("new_password is required when mode is manual")
        return self


class SmsDeliveryRetryResponse(BaseModel):
    delivery_id: UUID
    sms_sent: bool
    sms_error: str | None = None
    generated_password: str | None = None
