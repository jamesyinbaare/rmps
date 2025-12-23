from datetime import datetime

from pydantic import BaseModel, Field

from app.models import ExamType, ExamSeries, SubjectType


class ExamBase(BaseModel):
    """Base exam schema."""

    exam_type: ExamType
    description: str | None = None
    year: int = Field(..., ge=1900, le=2100)
    series: ExamSeries
    number_of_series: int = Field(1, ge=1, le=10)


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
    subject_name: str
    subject_type: SubjectType
    obj_pct: float | None
    essay_pct: float | None
    pract_pct: float | None
    obj_max_score: float | None
    essay_max_score: float | None
    pract_max_score: float | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
