"""Admin per-subject marking summary for finance and coordination."""

from pydantic import BaseModel, Field


class AdminExaminerMarkingSubjectPaperSummary(BaseModel):
    """One marking paper for a subject.

    Registered candidates enter the subject once but sit each paper separately, so
    each paper’s variance is allocated_scripts − registered_candidates (same
    registered count on every paper for that subject).
    """

    paper_number: int = Field(ge=1)
    registered_candidates: int = Field(ge=0)
    allocated_scripts: int = Field(ge=0)
    variance: int = Field(description="allocated_scripts minus registered_candidates")


class AdminExaminerMarkingSubjectSummaryRow(BaseModel):
    subject_id: int
    subject_code: str
    subject_name: str
    registered_candidates: int = Field(ge=0)
    total_allocated_scripts: int = Field(
        ge=0,
        description="Sum of allocated scripts across papers (not comparable 1:1 to registered).",
    )
    examiner_count: int = Field(ge=0)
    variance: int = Field(
        description=(
            "Sum of per-paper variances (allocated − registered for each paper). "
            "Equals total_allocated_scripts − registered_candidates × paper_count."
        )
    )
    papers: list[AdminExaminerMarkingSubjectPaperSummary] = Field(default_factory=list)


class AdminExaminerMarkingSubjectSummaryResponse(BaseModel):
    items: list[AdminExaminerMarkingSubjectSummaryRow]
    total: int
