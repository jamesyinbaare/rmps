"""Per-examination examiner allowance rate configuration (finance officer)."""

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.services.examiner_compensation import (
    all_allowance_type_labels,
    all_examiner_type_labels,
    allowance_type_from_api_label,
    examiner_type_from_api_label,
)


class SubjectMarkingBreakdownRow(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    paper_number: int = 1
    allocated_booklets: int = 0
    rate_per_script_ghs: Decimal | None = None
    marking_allowance_ghs: Decimal | None = None
    script_source: str = "allocation"


class ExaminerAllowanceSubjectRef(BaseModel):
    id: int
    code: str
    name: str
    subject_type: str
    paper_numbers: list[int]


class ExaminerRoleAllowanceRateCell(BaseModel):
    examiner_type: str
    allowance_type: str
    amount_ghs: Decimal | None = None


class ExaminationExaminerRoleAllowanceRatesResponse(BaseModel):
    examination_id: int
    items: list[ExaminerRoleAllowanceRateCell]


class ExaminerRoleAllowanceRateItemUpdate(BaseModel):
    examiner_type: str
    allowance_type: str
    amount_ghs: Decimal | None = None

    @field_validator("examiner_type")
    @classmethod
    def _valid_examiner_type(cls, v: str) -> str:
        return examiner_type_from_api_label(v).value

    @field_validator("allowance_type")
    @classmethod
    def _valid_allowance_type(cls, v: str) -> str:
        return allowance_type_from_api_label(v).value

    @field_validator("amount_ghs")
    @classmethod
    def _non_negative_amount(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Amount must be >= 0")
        return v


class ExaminationExaminerRoleAllowanceRatesPut(BaseModel):
    items: list[ExaminerRoleAllowanceRateItemUpdate] = Field(..., min_length=1)


class ExaminerMarkingRateRow(BaseModel):
    subject_id: int
    paper_number: int
    rate_per_script_ghs: Decimal | None = None


class ExaminationExaminerMarkingRatesResponse(BaseModel):
    examination_id: int
    subjects: list[ExaminerAllowanceSubjectRef]
    items: list[ExaminerMarkingRateRow]
    default_rate_paper_1_ghs: Decimal | None = None
    default_rate_paper_2_ghs: Decimal | None = None


class ExaminerMarkingRateItemUpdate(BaseModel):
    subject_id: int
    paper_number: int = Field(..., ge=1)
    rate_per_script_ghs: Decimal | None = None

    @field_validator("rate_per_script_ghs")
    @classmethod
    def _non_negative_rate(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Rate must be >= 0")
        return v


class ExaminationExaminerMarkingRatesPut(BaseModel):
    items: list[ExaminerMarkingRateItemUpdate] = Field(default_factory=list)
    default_rate_paper_1_ghs: Decimal | None = None
    default_rate_paper_2_ghs: Decimal | None = None
    apply_defaults_to_unset: bool = False

    @field_validator("default_rate_paper_1_ghs", "default_rate_paper_2_ghs")
    @classmethod
    def _non_negative_default(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Default rate must be >= 0")
        return v


class ExaminerSittingAllowanceRateCell(BaseModel):
    examiner_type: str
    daily_rate_ghs: Decimal | None = None


class ExaminationExaminerSittingAllowanceRatesResponse(BaseModel):
    examination_id: int
    items: list[ExaminerSittingAllowanceRateCell]


class ExaminerSittingAllowanceRateItemUpdate(BaseModel):
    examiner_type: str
    daily_rate_ghs: Decimal | None = None

    @field_validator("examiner_type")
    @classmethod
    def _valid_examiner_type(cls, v: str) -> str:
        return examiner_type_from_api_label(v).value

    @field_validator("daily_rate_ghs")
    @classmethod
    def _non_negative_rate(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Rate must be >= 0")
        return v


class ExaminationExaminerSittingAllowanceRatesPut(BaseModel):
    items: list[ExaminerSittingAllowanceRateItemUpdate] = Field(..., min_length=1)


class ExaminerDefaultDaysCell(BaseModel):
    examiner_type: str
    default_days: int | None = None


class ExaminationExaminerDefaultDaysResponse(BaseModel):
    examination_id: int
    items: list[ExaminerDefaultDaysCell]


class ExaminerDefaultDaysItemUpdate(BaseModel):
    examiner_type: str
    default_days: int | None = Field(default=None, ge=1)

    @field_validator("examiner_type")
    @classmethod
    def _valid_examiner_type(cls, v: str) -> str:
        return examiner_type_from_api_label(v).value


class ExaminationExaminerDefaultDaysPut(BaseModel):
    items: list[ExaminerDefaultDaysItemUpdate] = Field(..., min_length=1)


class ExaminerTravelRateRow(BaseModel):
    region: str
    amount_ghs: Decimal | None = None


class ExaminerTravelZoneRow(BaseModel):
    id: UUID
    name: str
    regions: list[str]


class ExaminerTravelRoleFactorRow(BaseModel):
    examiner_type: str
    zone_id: UUID
    factor: Decimal | None = None


class ExaminationExaminerTravelRatesResponse(BaseModel):
    examination_id: int
    zones: list[ExaminerTravelZoneRow]
    items: list[ExaminerTravelRateRow]
    role_factors: list[ExaminerTravelRoleFactorRow]


class ExaminerTravelRateItemUpdate(BaseModel):
    region: str
    amount_ghs: Decimal | None = None

    @field_validator("amount_ghs")
    @classmethod
    def _non_negative_amount(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v < 0:
            raise ValueError("Amount must be >= 0")
        return v


class ExaminerTravelZoneItemUpdate(BaseModel):
    id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=64)
    regions: list[str] = Field(default_factory=list)


class ExaminerTravelRoleFactorItemUpdate(BaseModel):
    examiner_type: str
    zone_id: UUID
    factor: Decimal | None = None

    @field_validator("examiner_type")
    @classmethod
    def _valid_examiner_type(cls, v: str) -> str:
        from app.services.examiner_compensation import examiner_type_from_api_label

        return examiner_type_from_api_label(v).value

    @field_validator("factor")
    @classmethod
    def _positive_factor(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("Factor must be > 0")
        return v


class ExaminationExaminerTravelRatesPut(BaseModel):
    items: list[ExaminerTravelRateItemUpdate] = Field(..., min_length=1)
    zones: list[ExaminerTravelZoneItemUpdate] | None = None
    role_factors: list[ExaminerTravelRoleFactorItemUpdate] | None = None


class ExaminerAllowanceRatesCopyResponse(BaseModel):
    examination_id: int
    copied: bool = True


class ExaminerAllowanceRatesConfigSummary(BaseModel):
    """Lightweight config status for exam list badges."""

    examination_id: int
    role_cells_configured: int
    role_cells_total: int
    marking_subjects_configured: int
    marking_subjects_total: int
    travel_regions_configured: int
    travel_regions_total: int


def validate_allowance_type_label(label: str) -> str:
    return allowance_type_from_api_label(label).value


def all_configured_allowance_types() -> list[str]:
    return all_allowance_type_labels()


def all_configured_examiner_types() -> list[str]:
    return all_examiner_type_labels()
