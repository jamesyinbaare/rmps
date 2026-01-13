from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, ConfigDict, computed_field
from uuid import UUID

from app.models import RegistrationStatus


class RegistrationCandidatePhotoResponse(BaseModel):
    """Schema for registration candidate photo response."""

    id: int
    registration_candidate_id: int
    file_name: str
    mime_type: str
    uploaded_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PhotoAlbumItem(BaseModel):
    """Schema for a single item in the photo album."""

    candidate_id: int
    candidate_name: str
    registration_number: str
    index_number: str | None
    school_id: int | None
    school_name: str | None
    school_code: str | None
    photo: RegistrationCandidatePhotoResponse | None = None


class PhotoAlbumResponse(BaseModel):
    """Schema for photo album response."""

    items: list[PhotoAlbumItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class PhotoBulkUploadError(BaseModel):
    """Schema for bulk photo upload error details."""

    filename: str
    registration_number: str | None = None
    index_number: str | None = None
    error_message: str


class PhotoBulkUploadResponse(BaseModel):
    """Schema for bulk photo upload response."""

    total: int
    successful: int
    failed: int
    skipped: int
    errors: list[PhotoBulkUploadError]


class RegistrationCandidateBase(BaseModel):
    """Base schema for registration candidate."""

    firstname: str = Field(..., min_length=1, max_length=255)
    lastname: str = Field(..., min_length=1, max_length=255)
    othername: str | None = Field(None, max_length=255)
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=20)
    programme_code: str | None = None  # Kept for backward compatibility
    programme_id: int | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(None, max_length=50)
    address: str | None = None
    national_id: str | None = Field(None, max_length=50)
    disability: str | None = Field(None, description="Disability type: Visual, Auditory, Physical, Cognitive, Speech, Other")
    registration_type: str | None = Field(None, description="Registration type: free_tvet, private, or referral")
    guardian_name: str | None = Field(None, max_length=255)
    guardian_phone: str | None = Field(None, max_length=50)
    guardian_digital_address: str | None = Field(None, max_length=50, description="Ghana digital address")
    guardian_national_id: str | None = Field(None, max_length=50)

    @computed_field
    def name(self) -> str:
        """Computed name from firstname, lastname, and othername."""
        parts = [self.firstname]
        if self.othername:
            parts.append(self.othername)
        parts.append(self.lastname)
        return " ".join(parts)

    @computed_field
    def fullname(self) -> str:
        """Fullname (same as name for backward compatibility)."""
        return self.name


class RegistrationCandidateCreate(RegistrationCandidateBase):
    """Schema for creating a registration candidate."""

    school_id: int | None = Field(None, description="Examination center (school) ID - required for private candidates")
    subject_codes: list[str] = Field(default_factory=list, description="List of subject codes (for backward compatibility)")
    subject_ids: list[int] = Field(default_factory=list, description="List of subject IDs")


class RegistrationCandidateUpdate(BaseModel):
    """Schema for updating a registration candidate."""

    firstname: str | None = Field(None, min_length=1, max_length=255)
    lastname: str | None = Field(None, min_length=1, max_length=255)
    othername: str | None = Field(None, max_length=255)
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=20)
    programme_code: str | None = None  # Kept for backward compatibility
    programme_id: int | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(None, max_length=50)
    address: str | None = None
    national_id: str | None = Field(None, max_length=50)
    disability: str | None = Field(None, description="Disability type: Visual, Auditory, Physical, Cognitive, Speech, Other")
    registration_type: str | None = Field(None, description="Registration type: free_tvet, private, or referral")
    guardian_name: str | None = Field(None, max_length=255)
    guardian_phone: str | None = Field(None, max_length=50)
    guardian_digital_address: str | None = Field(None, max_length=50, description="Ghana digital address")
    guardian_national_id: str | None = Field(None, max_length=50)
    subject_codes: list[str] | None = None  # Kept for backward compatibility
    subject_ids: list[int] | None = None


class RegistrationSubjectSelectionResponse(BaseModel):
    """Schema for subject selection response."""

    id: int
    subject_id: int | None = None
    subject_code: str
    subject_name: str
    series: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RegistrationCandidateResponse(RegistrationCandidateBase):
    """Schema for registration candidate response."""

    id: int
    registration_exam_id: int
    school_id: int | None = None
    registration_number: str
    index_number: str | None = None
    registration_status: RegistrationStatus
    registration_date: datetime
    subject_selections: list[RegistrationSubjectSelectionResponse] = []
    exam: RegistrationExamResponse | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CandidateListResponse(BaseModel):
    """Schema for paginated candidate list response."""

    items: list[RegistrationCandidateResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class BulkUploadError(BaseModel):
    """Schema for bulk upload error details."""

    row_number: int
    error_message: str
    field: str | None = None


class BulkUploadResponse(BaseModel):
    """Schema for bulk upload response."""

    total_rows: int
    successful: int
    failed: int
    errors: list[BulkUploadError]


class ExamRegistrationPeriodCreate(BaseModel):
    """Schema for creating an exam registration period."""

    registration_start_date: datetime
    registration_end_date: datetime
    allows_bulk_registration: bool = True
    allows_private_registration: bool = True


class ExamRegistrationPeriodUpdate(BaseModel):
    """Schema for updating an exam registration period."""

    registration_start_date: datetime | None = None
    registration_end_date: datetime | None = None
    is_active: bool | None = None
    allows_bulk_registration: bool | None = None
    allows_private_registration: bool | None = None


class ExamRegistrationPeriodResponse(BaseModel):
    """Schema for exam registration period response."""

    id: int
    registration_start_date: datetime
    registration_end_date: datetime
    is_active: bool
    allows_bulk_registration: bool
    allows_private_registration: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RegistrationExamCreate(BaseModel):
    """Schema for creating a registration exam."""

    exam_id_main_system: int | None = None
    exam_type: str
    exam_series: str | None = None
    year: int
    description: str | None = None
    pricing_model_preference: str | None = Field(None, description="Pricing model: 'per_subject', 'tiered', 'per_programme', or 'auto'")
    registration_period: ExamRegistrationPeriodCreate

    @model_validator(mode="after")
    def validate_exam_series(self) -> RegistrationExamCreate:
        """Validate exam_series is required for Certificate II Examinations and valid when provided."""
        if self.exam_type == "Certificate II Examinations":
            if not self.exam_series or self.exam_series.strip() == "":
                raise ValueError("exam_series is required for Certificate II Examinations")
            # Normalize the value
            v_normalized = self.exam_series.upper().replace("-", "/").strip()
            if v_normalized not in ("MAY/JUNE", "NOV/DEC"):
                raise ValueError("exam_series must be either 'MAY/JUNE' or 'NOV/DEC' for Certificate II Examinations")
            self.exam_series = v_normalized
        else:
            # For non-Certificate II Examinations exams, exam_series should be None or empty
            if self.exam_series and self.exam_series.strip() != "":
                raise ValueError(f"exam_series is not allowed for {self.exam_type} examinations. Only Certificate II Examinations have exam series.")
            self.exam_series = None
        return self


class RegistrationExamUpdate(BaseModel):
    """Schema for updating a registration exam."""

    exam_id_main_system: int | None = None
    exam_type: str | None = None
    exam_series: str | None = None
    year: int | None = None
    description: str | None = None
    pricing_model_preference: str | None = Field(None, description="Pricing model: 'per_subject', 'tiered', 'per_programme', or 'auto'")


class RegistrationExamResponse(BaseModel):
    """Schema for registration exam response."""

    id: int
    exam_id_main_system: int | None = None
    exam_type: str
    exam_series: str | None = None
    year: int
    description: str | None = None
    registration_period: ExamRegistrationPeriodResponse
    results_published: bool = False
    results_published_at: datetime | None = None
    results_published_by_user_id: str | None = None
    pricing_model_preference: str | None = None
    has_index_numbers: bool = False
    candidate_count: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator('results_published_by_user_id', mode='before')
    @classmethod
    def convert_uuid_to_string(cls, v):
        """Convert UUID to string if it's a UUID object."""
        if v is None:
            return None
        if isinstance(v, UUID):
            return str(v)
        return v


class SchoolProgressItem(BaseModel):
    """Schema for school progress in index number generation."""

    school_id: int
    school_code: str
    school_name: str
    processed: int
    total: int
    status: str  # "pending", "processing", "completed", "failed"

    model_config = ConfigDict(from_attributes=True)


class IndexNumberGenerationJobResponse(BaseModel):
    """Schema for index number generation job response."""

    id: int
    exam_id: int
    status: str  # "pending", "processing", "completed", "failed"
    replace_existing: bool
    progress_current: int
    progress_total: int
    current_school_id: int | None
    current_school_name: str | None
    school_progress: list[SchoolProgressItem] | None
    error_message: str | None
    created_by_user_id: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
