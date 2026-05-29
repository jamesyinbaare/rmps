"""Per-examination designation allowance rates (finance officer)."""

from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.services.exam_official_compensation import all_designation_labels


class ExaminationDesignationRateRow(BaseModel):
    designation: str
    daily_rate_ghs: Decimal | None = None
    commuting_allowance_ghs: Decimal | None = None
    airtime_ghs: Decimal | None = None


class ExaminationDesignationRatesResponse(BaseModel):
    examination_id: int
    items: list[ExaminationDesignationRateRow]


class ExaminationDesignationRateAmountsUpdate(BaseModel):
    daily_rate_ghs: Decimal | None = None
    commuting_allowance_ghs: Decimal | None = None
    airtime_ghs: Decimal | None = None

    @field_validator("daily_rate_ghs", "commuting_allowance_ghs", "airtime_ghs")
    @classmethod
    def _non_negative_amount(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Amount must be >= 0")
        return v


class ExaminationDesignationRateItemUpdate(ExaminationDesignationRateAmountsUpdate):
    designation: str

    @field_validator("designation")
    @classmethod
    def _valid_designation(cls, v: str) -> str:
        raw = v.strip()
        if raw not in all_designation_labels():
            raise ValueError(f"Invalid designation (expected one of: {all_designation_labels()})")
        return raw

class ExaminationDesignationRatesPut(BaseModel):
    items: list[ExaminationDesignationRateItemUpdate] = Field(..., min_length=1)
