"""Schemas for the Results & Certificates browser (Phase 1)."""

from datetime import date

from pydantic import BaseModel, Field

from app.models import CertificateIssuanceStatus, Grade


class ExamSchoolSummary(BaseModel):
    """School with candidate registration counts for an exam."""

    school_id: int
    school_code: str
    school_name: str
    region: str | None = None
    candidate_count: int
    fully_graded_count: int = Field(
        0, description="Candidates whose every registered subject has a stored non-Pending grade"
    )


class ExamSchoolListResponse(BaseModel):
    items: list[ExamSchoolSummary]
    total: int
    page: int
    page_size: int


class ExamResultsSummary(BaseModel):
    """Exam-level results KPIs for the results dashboard."""

    exam_id: int
    school_count: int
    candidate_count: int
    fully_graded_count: int
    pending_count: int
    completion_percentage: float


class SchoolResultsSummary(BaseModel):
    """School-level results KPIs for one examination."""

    exam_id: int
    school_id: int
    school_code: str
    school_name: str
    region: str | None = None
    candidate_count: int
    fully_graded_count: int
    pending_count: int
    completion_percentage: float
    programme_count: int


class ExamProgrammeSummary(BaseModel):
    """Programme available for filtering within an exam+school."""

    programme_id: int
    programme_code: str
    programme_name: str
    candidate_count: int


class CandidateResultSummary(BaseModel):
    """One candidate row in the school results table."""

    exam_registration_id: int
    candidate_id: int
    candidate_name: str
    index_number: str
    programme_id: int | None = None
    programme_code: str | None = None
    programme_name: str | None = None
    subjects_registered: int
    subjects_graded: int
    subjects_pending: int
    is_fully_graded: bool
    issuance_id: int | None = None
    certificate_number: str | None = None
    issuance_status: CertificateIssuanceStatus | None = None


class SchoolResultsListResponse(BaseModel):
    items: list[CandidateResultSummary]
    total: int
    page: int
    page_size: int
    school_id: int
    school_code: str
    school_name: str
    exam_id: int


class IssueFormCandidate(BaseModel):
    issuance_id: int | None = None
    exam_registration_id: int
    candidate_id: int
    candidate_name: str
    index_number: str
    certificate_number: str | None = None
    status: CertificateIssuanceStatus | None = None
    programme_id: int | None = None
    programme_code: str | None = None
    programme_name: str | None = None


class IssueFormProgrammeGroup(BaseModel):
    programme_id: int | None = None
    programme_code: str | None = None
    programme_name: str | None = None
    candidate_count: int


class IssueFormCandidatesResponse(BaseModel):
    items: list[IssueFormCandidate]
    total: int
    page: int = 1
    page_size: int = 50
    school_id: int
    school_code: str
    school_name: str
    exam_id: int
    exam_label: str
    programmes: list[IssueFormProgrammeGroup]


class SubjectResultDetail(BaseModel):
    """Per-subject scores and grade for certificate/results detail."""

    subject_registration_id: int
    exam_subject_id: int
    subject_id: int
    subject_code: str
    subject_name: str
    subject_type: str | None = None
    series: int | None = None
    # Raw
    obj_raw_score: str | None = None
    essay_raw_score: str | None = None
    pract_raw_score: str | None = None
    # Normalized
    obj_normalized: float | None = None
    essay_normalized: float | None = None
    pract_normalized: float | None = None
    total_score: float | None = None
    # Grade
    grade: Grade | None = None  # Persisted when results are processed; null means not yet graded
    # Max scores (for UI context)
    obj_max_score: float | None = None
    essay_max_score: float | None = None
    pract_max_score: float | None = None
    has_score: bool = False


class ExamRegistrationResultDetail(BaseModel):
    """Full result detail for one exam registration."""

    exam_registration_id: int
    exam_id: int
    exam_type: str
    exam_year: int
    exam_series: str
    candidate_id: int
    candidate_name: str
    index_number: str
    date_of_birth: date | None = None
    gender: str | None = None
    school_id: int
    school_code: str
    school_name: str
    programme_id: int | None = None
    programme_code: str | None = None
    programme_name: str | None = None
    subjects: list[SubjectResultDetail]
    subjects_registered: int
    subjects_graded: int
    subjects_pending: int
    is_fully_graded: bool
