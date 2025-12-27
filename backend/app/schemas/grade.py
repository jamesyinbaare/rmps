from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models import Grade


class GradeRangeConfig(BaseModel):
    """Schema for a single grade range configuration."""

    grade: str = Field(..., description="Grade name: Fail, Pass, Lower Credit, Credit, Upper Credit, or Distinction")
    min: float | None = Field(None, ge=0.0, le=100.0, description="Minimum score for this grade (inclusive)")
    max: float | None = Field(None, ge=0.0, le=100.0, description="Maximum score for this grade (inclusive)")

    @field_validator("grade")
    @classmethod
    def validate_grade(cls, v: str) -> str:
        """Validate that grade is a valid Grade enum value."""
        try:
            Grade(v)
        except ValueError:
            valid_grades = ", ".join([g.value for g in Grade])
            raise ValueError(f"Invalid grade '{v}'. Must be one of: {valid_grades}")
        return v

    @field_validator("min", "max")
    @classmethod
    def validate_min_max(cls, v: float | None, info) -> float | None:
        """Validate min <= max when both are provided."""
        if v is None:
            return v
        # Check if both min and max are set and min <= max
        if info.data and "min" in info.data and "max" in info.data:
            min_val = info.data.get("min")
            max_val = info.data.get("max")
            if min_val is not None and max_val is not None and min_val > max_val:
                raise ValueError("min must be less than or equal to max")
        return v


class GradeRangesUpdate(BaseModel):
    """Schema for updating grade ranges JSON field on ExamSubject."""

    grade_ranges: list[GradeRangeConfig] = Field(
        ..., min_length=1, max_length=6, description="Array of grade range configurations"
    )

    @field_validator("grade_ranges")
    @classmethod
    def validate_grade_ranges(cls, v: list[GradeRangeConfig]) -> list[GradeRangeConfig]:
        """Validate that all 6 grades are present."""
        if len(v) != 6:
            raise ValueError("Must provide exactly 6 grade ranges")

        # Check that all grades are unique
        grades = [gr.grade for gr in v]
        if len(grades) != len(set(grades)):
            raise ValueError("Duplicate grades found. Each grade must be unique.")

        # Check that all required grades are present
        required_grades = {g.value for g in Grade}
        provided_grades = set(grades)
        if required_grades != provided_grades:
            missing = required_grades - provided_grades
            extra = provided_grades - required_grades
            error_msg = []
            if missing:
                error_msg.append(f"Missing grades: {', '.join(missing)}")
            if extra:
                error_msg.append(f"Invalid grades: {', '.join(extra)}")
            raise ValueError("; ".join(error_msg))

        return v


class GradeRangesResponse(BaseModel):
    """Schema for grade ranges response."""

    exam_subject_id: int
    grade_ranges: list[dict[str, Any]] | None = Field(
        None, description="Array of grade range configurations: [{\"grade\": \"Fail\", \"min\": 0, \"max\": 40}, ...]"
    )

    class Config:
        from_attributes = True
