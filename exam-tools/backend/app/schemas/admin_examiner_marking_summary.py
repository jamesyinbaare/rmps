"""Admin per-subject marking summary for finance and coordination."""

from pydantic import BaseModel, Field


class AdminExaminerMarkingSubjectSummaryRow(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    registered_candidates: int = Field(ge=0)
    total_allocated_scripts: int = Field(ge=0)
    examiner_count: int = Field(ge=0)
    variance: int = Field(description="total_allocated_scripts minus registered_candidates")


class AdminExaminerMarkingSubjectSummaryResponse(BaseModel):
    items: list[AdminExaminerMarkingSubjectSummaryRow]
    total: int
