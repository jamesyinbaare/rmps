from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models import ExamType, ExamSeries, SubjectType


class ExamBase(BaseModel):
    """Base exam schema."""

    exam_type: ExamType
    description: str | None = None
    year: int = Field(..., ge=1900, le=2100)
    series: ExamSeries
    number_of_series: int = Field(1, ge=1, le=10)
    subjects_to_serialize: list[str] | None = None


class ExamCreate(ExamBase):
    """Schema for creating an exam."""

    pass


class ExamUpdate(BaseModel):
    """Schema for updating an exam."""

    exam_type: ExamType | None = None
    description: str | None = None
    year: int | None = Field(None, ge=1900, le=2100)
    series: ExamSeries | None = None
    number_of_series: int | None = Field(None, ge=1, le=10)
    subjects_to_serialize: list[str] | None = None


class ExamResponse(ExamBase):
    """Schema for exam response."""

    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExamListResponse(BaseModel):
    """Schema for paginated exam list response."""

    items: list[ExamResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ExamSubjectCreate(BaseModel):
    """Schema for adding a subject to an exam."""

    subject_id: int
    obj_pct: float | None = Field(None, ge=0.0, le=100.0)
    essay_pct: float | None = Field(None, ge=0.0, le=100.0)
    pract_pct: float | None = Field(None, ge=0.0, le=100.0)
    obj_max_score: float | None = Field(None, ge=0.0)
    essay_max_score: float | None = Field(None, ge=0.0)
    pract_max_score: float | None = Field(None, ge=0.0)


class ExamSubjectUpdate(BaseModel):
    """Schema for updating exam subject percentages."""

    obj_pct: float | None = Field(None, ge=0.0, le=100.0)
    essay_pct: float | None = Field(None, ge=0.0, le=100.0)
    pract_pct: float | None = Field(None, ge=0.0, le=100.0)
    obj_max_score: float | None = Field(None, ge=0.0)
    essay_max_score: float | None = Field(None, ge=0.0)
    pract_max_score: float | None = Field(None, ge=0.0)


class ExamSubjectResponse(BaseModel):
    """Schema for exam subject response."""

    id: int
    exam_id: int
    subject_id: int
    subject_code: str
    original_code: str
    subject_name: str
    subject_type: SubjectType
    obj_pct: float | None
    essay_pct: float | None
    pract_pct: float | None
    obj_max_score: float | None
    essay_max_score: float | None
    pract_max_score: float | None
    grade_ranges_json: list[dict] | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExamSubjectBulkUploadError(BaseModel):
    """Schema for exam subject bulk upload error."""

    row_number: int
    original_code: str
    error_message: str
    field: str | None = None


class ExamSubjectBulkUploadResponse(BaseModel):
    """Schema for exam subject bulk upload response."""

    total_rows: int
    successful: int
    failed: int
    errors: list[ExamSubjectBulkUploadError]


class SchoolProcessedInfo(BaseModel):
    """Schema for school processing information in serialization response."""

    school_id: int
    school_name: str
    candidates_count: int


class SubjectProcessedInfo(BaseModel):
    """Schema for subject processing information in serialization response."""

    subject_id: int
    subject_code: str
    subject_name: str
    candidates_count: int


class SerializationResponse(BaseModel):
    """Schema for serialization response."""

    exam_id: int
    school_id: int | None
    total_candidates_count: int
    total_schools_count: int
    subjects_serialized_count: int
    subjects_defaulted_count: int
    schools_processed: list[SchoolProcessedInfo]
    subjects_processed: list[SubjectProcessedInfo]
    subjects_defaulted: list[SubjectProcessedInfo]
    message: str


class SchoolSheetInfo(BaseModel):
    """Schema for school score sheet generation information."""

    school_id: int
    school_name: str
    sheets_count: int
    candidates_count: int


class SubjectSheetInfo(BaseModel):
    """Schema for subject score sheet generation information."""

    subject_id: int
    subject_code: str
    subject_name: str
    sheets_count: int
    candidates_count: int


class ScoreSheetGenerationResponse(BaseModel):
    """Schema for score sheet generation response."""

    exam_id: int
    total_sheets_generated: int
    total_candidates_assigned: int
    schools_processed: list[SchoolSheetInfo]
    subjects_processed: list[SubjectSheetInfo]
    sheets_by_series: dict[int, int]
    message: str


class SchoolPdfInfo(BaseModel):
    """Schema for school PDF generation information."""

    school_id: int
    school_name: str
    pdfs_count: int
    sheets_count: int
    candidates_count: int


class SubjectPdfInfo(BaseModel):
    """Schema for subject PDF generation information."""

    subject_id: int
    subject_code: str
    subject_name: str
    pdfs_count: int
    sheets_count: int
    candidates_count: int


class PdfGenerationResponse(BaseModel):
    """Schema for PDF generation response."""

    exam_id: int
    total_pdfs_generated: int
    total_sheets_generated: int
    total_candidates_assigned: int
    schools_processed: list[SchoolPdfInfo]
    subjects_processed: list[SubjectPdfInfo]
    sheets_by_series: dict[int, int]
    message: str


class SheetIdInfo(BaseModel):
    """Schema for detailed sheet ID information."""

    sheet_id: str
    test_type: int | None  # 1=Objectives, 2=Essay, 3=Practicals
    school_id: int | None = None
    school_name: str | None = None
    school_code: str | None = None
    subject_id: int | None = None
    subject_code: str | None = None
    subject_name: str | None = None
    series: int | None = None
    sheet_number: int | None = None
    candidate_count: int | None = None  # For expected sheets
    document_id: int | None = None  # For uploaded sheets
    file_name: str | None = None  # For uploaded sheets
    status: str  # "expected", "uploaded", "missing", "extra"


class SheetIdComparisonResponse(BaseModel):
    """Schema for sheet ID comparison response."""

    exam_id: int
    total_expected_sheets: int
    total_uploaded_sheets: int
    missing_sheet_ids: list[str]
    uploaded_sheet_ids: list[str]
    extra_sheet_ids: list[str]
    expected_by_test_type: dict[int, int]
    uploaded_by_test_type: dict[int, int]
    expected_sheet_ids_info: list[SheetIdInfo]
    missing_sheet_ids_info: list[SheetIdInfo]
    uploaded_sheet_ids_info: list[SheetIdInfo]
    extra_sheet_ids_info: list[SheetIdInfo]


class PdfGenerationJobCreate(BaseModel):
    """Schema for creating a PDF generation job."""

    school_ids: list[int] | None = None  # None = all schools
    subject_id: int | None = None
    test_types: list[int] = Field(default=[1, 2], description="List of test types (1 = Objectives, 2 = Essay)")


class PdfGenerationJobResult(BaseModel):
    """Schema for a completed school result in a job."""

    school_id: int
    school_name: str
    school_code: str
    pdf_file_path: str | None = None
    error: str | None = None


class PdfGenerationJobResponse(BaseModel):
    """Schema for PDF generation job response."""

    id: int
    status: str
    exam_id: int
    school_ids: list[int] | None
    subject_id: int | None
    test_types: list[int]
    progress_current: int
    progress_total: int
    current_school_name: str | None
    error_message: str | None
    results: list[PdfGenerationJobResult] | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    class Config:
        from_attributes = True


class PdfGenerationJobListResponse(BaseModel):
    """Schema for paginated PDF generation job list response."""

    items: list[PdfGenerationJobResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class DeleteJobsRequest(BaseModel):
    """Schema for deleting multiple PDF generation jobs."""

    job_ids: list[int] = Field(..., description="List of job IDs to delete")


class RegistrationProgress(BaseModel):
    """Schema for candidate registration progress."""

    total_candidates: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class SerializationProgress(BaseModel):
    """Schema for serialization progress with per-school/subject tracking."""

    total_candidates: int
    candidates_serialized: int
    total_schools: int
    schools_serialized: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"
    last_serialized_at: str | None  # ISO datetime string
    schools_detail: list[dict[str, Any]]  # Per-school serialization status
    subjects_detail: list[dict[str, Any]]  # Per-subject serialization status


class IcmPdfGenerationProgress(BaseModel):
    """Schema for ICM/PDF/Score sheet generation progress."""

    total_schools: int
    schools_with_sheets: int
    total_subjects: int
    subjects_with_sheets: int
    score_sheets_generated: int
    pdfs_generated: int
    excel_exports_generated: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"
    schools_detail: list[dict[str, Any]]  # Per-school generation status
    subjects_detail: list[dict[str, Any]]  # Per-subject generation status
    excel_exports: list[dict[str, Any]]  # Excel export file tracking


class PreparationsProgress(BaseModel):
    """Schema for preparations phase progress (registration, serialization, ICM/PDF generation)."""

    registration: RegistrationProgress
    serialization: SerializationProgress
    icm_pdf_generation: IcmPdfGenerationProgress
    overall_completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class ScoreInterpretationProgress(BaseModel):
    """Schema for score interpretation progress (setting max scores, percentages)."""

    total_subjects: int
    subjects_configured: int  # Subjects with percentages and max scores set
    subjects_with_grade_ranges: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class DocumentProcessingProgress(BaseModel):
    """Schema for document processing phase progress."""

    total_documents: int
    documents_id_extracted_success: int
    documents_id_extracted_error: int
    documents_id_extracted_pending: int
    documents_scores_extracted_success: int
    documents_scores_extracted_error: int
    documents_scores_extracted_pending: int
    id_extraction_completion_percentage: float
    scores_extraction_completion_percentage: float
    overall_completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class ScoringDataEntryProgress(BaseModel):
    """Schema for scoring/data entry progress."""

    total_subject_registrations: int
    registrations_with_scores: int
    total_expected_score_entries: int  # Total expected entries based on max_scores set
    total_actual_score_entries: int  # Total actual entries (raw scores entered)
    registrations_manual_entry: int
    registrations_digital_transcription: int
    registrations_automated_extraction: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class ValidationIssuesProgress(BaseModel):
    """Schema for validation issues resolution progress."""

    unmatched_records_total: int
    unmatched_records_pending: int
    unmatched_records_resolved: int
    validation_issues_total: int
    validation_issues_pending: int
    validation_issues_resolved: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class ResultsProcessingProgress(BaseModel):
    """Schema for results processing phase progress (normalization, total scores)."""

    total_subject_registrations: int
    registrations_processed: int  # Has normalized scores and total_score > 0
    registrations_pending: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class ResultsProcessingOverallProgress(BaseModel):
    """Schema for overall results processing phase progress."""

    score_interpretation: ScoreInterpretationProgress
    document_processing: DocumentProcessingProgress
    scoring_data_entry: ScoringDataEntryProgress
    validation_issues: ValidationIssuesProgress
    results_processing: ResultsProcessingProgress
    overall_completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class GradeRangesProgress(BaseModel):
    """Schema for grade ranges setup progress."""

    total_subjects: int
    subjects_with_grade_ranges: int
    completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class ResultsReleaseProgress(BaseModel):
    """Schema for results release phase progress."""

    grade_ranges: GradeRangesProgress
    overall_completion_percentage: float
    status: str  # "complete", "in_progress", "pending"


class ExamProgressResponse(BaseModel):
    """Schema for comprehensive exam progress response."""

    exam_id: int
    exam_type: str
    exam_year: int
    exam_series: str
    preparations: PreparationsProgress
    results_processing: ResultsProcessingOverallProgress
    results_release: ResultsReleaseProgress
    overall_completion_percentage: float
    overall_status: str  # "complete", "in_progress", "pending"
