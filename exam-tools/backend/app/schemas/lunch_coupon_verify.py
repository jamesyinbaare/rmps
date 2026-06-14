from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LunchCouponVerifyRequest(BaseModel):
    reference_code: str = Field(..., min_length=1, max_length=64)


class LunchCouponVerifyResponse(BaseModel):
    valid: bool
    message: str | None = None
    reference_code: str | None = None
    name: str | None = None
    examiner_type: str | None = None
    examiner_type_label: str | None = None
    region: str | None = None
    subject_codes: list[str] | None = None
    examiner_id: UUID | None = None
    examination_id: int | None = None
    examination_name: str | None = None
    already_verified: bool = False
    verified_at: datetime | None = None
    verified_by_name: str | None = None
    verification_date: date | None = None
    recorded: bool = False


class LunchCouponVerifiedRow(BaseModel):
    examiner_id: UUID
    reference_code: str
    name: str
    examiner_type_label: str
    region: str
    subject_codes: list[str]
    verified_at: datetime
    verification_date: date
    verified_by_name: str | None = None
    examination_id: int | None = None
    examination_name: str | None = None


class LunchCouponVerifiedListResponse(BaseModel):
    items: list[LunchCouponVerifiedRow]
    total: int
