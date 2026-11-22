from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator, ConfigDict, computed_field
from uuid import UUID

from app.models import ExamKind, FeePaymentStatus, RegistrationStatus


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


class PhotoExamSummaryItem(BaseModel):
    """Per-exam photo coverage summary for a school."""

    exam_id: int
    total: int
    with_photo: int
    without_photo: int


class PhotoExamSummaryResponse(BaseModel):
    """Photo coverage summary across exams (or a single exam)."""

    items: list[PhotoExamSummaryItem]


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
    address: str | None = Field(None, max_length=50, description="Ghana digital address")
    national_id: str | None = Field(None, max_length=50)
    disability: str | None = Field(None, description="Disability type: Visual, Auditory, Physical, Cognitive, Speech, Other")
    registration_type: str | None = Field(
        None, description="Registration type: regular, free_tvet, private, or referral"
    )
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

    date_of_birth: date = Field(..., description="Candidate date of birth")
    gender: str = Field(..., min_length=1, max_length=20, description="Candidate gender")
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
    address: str | None = Field(None, max_length=50, description="Ghana digital address")
    national_id: str | None = Field(None, max_length=50)
    disability: str | None = Field(None, description="Disability type: Visual, Auditory, Physical, Cognitive, Speech, Other")
    registration_type: str | None = Field(
        None, description="Registration type: regular, free_tvet, private, or referral"
    )
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
    fee_payment_status: FeePaymentStatus = FeePaymentStatus.UNPAID
    fee_paid_at: datetime | None = None
    fee_paid_by_user_id: str | None = None
    registration_date: datetime
    subject_selections: list[RegistrationSubjectSelectionResponse] = []
    exam: RegistrationExamResponse | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("fee_paid_by_user_id", mode="before")
    @classmethod
    def convert_fee_paid_by_uuid(cls, v):
        if v is None:
            return None
        return str(v)


class CandidateFeeBulkUpdate(BaseModel):
    """Mark fees paid/waived for multiple candidates."""

    candidate_ids: list[int] = Field(default_factory=list, min_length=1)
    action: str = Field(..., description="paid or waived")


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


class BulkCandidateRow(BaseModel):
    """One spreadsheet row for chunked bulk upload (extra keys allowed)."""

    model_config = ConfigDict(extra="allow")

    row_number: int
    firstname: str | None = None
    lastname: str | None = None
    othername: str | None = None
    date_of_birth: str | None = None
    dob: str | None = None
    gender: str | None = None
    programme_code: str | None = None
    programme: str | None = None
    option: str | None = None
    subject_codes: str | None = None
    registration_type: str | None = None
    contact_email: str | None = None
    email: str | None = None
    contact_phone: str | None = None
    phone: str | None = None
    address: str | None = None
    national_id: str | None = None
    guardian_name: str | None = None
    guardian_phone: str | None = None
    guardian_digital_address: str | None = None
    guardian_national_id: str | None = None
    disability: str | None = None
    examination_center: str | int | None = None
    school_id: str | int | None = None
    center_id: str | int | None = None


class BulkCandidateChunkRequest(BaseModel):
    """JSON body for chunked school bulk upload."""

    exam_id: int
    registration_type: str | None = None
    rows: list[BulkCandidateRow]
    dry_run: bool = False


class BulkCandidateParseResponse(BaseModel):
    """Parsed spreadsheet rows for client-side chunked upload."""

    total_rows: int
    rows: list[dict]


class BulkUploadResultsExportRequest(BaseModel):
    """Rows + errors to export as an Excel results workbook."""

    rows: list[dict]
    errors: list[BulkUploadError] = []


class ExamRegistrationPeriodCreate(BaseModel):
    """Schema for creating an exam registration period."""

    registration_start_date: datetime
    registration_end_date: datetime
    allows_bulk_registration: bool = True
    # Derived from exam_kind on create; kept optional for backward-compatible clients
    allows_private_registration: bool | None = None


class ExamRegistrationPeriodUpdate(BaseModel):
    """Schema for updating an exam registration period."""

    registration_start_date: datetime | None = None
    registration_end_date: datetime | None = None
    is_active: bool | None = None
    allows_bulk_registration: bool | None = None
    # Derived from exam_kind; ignored if exam_kind is set on the exam
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
    programme_type_id: int = Field(..., description="Root programme type for this examination")
    exam_series_id: int = Field(..., description="Series/sitting from the exam series catalog")
    year: int
    description: str | None = None
    exam_kind: str = Field(
        default=ExamKind.SCHOOL.value,
        description="Examination kind: 'school' or 'private'",
    )
    allows_referral_registration: bool = Field(
        default=True,
        description="Whether referral candidates may register (school exams only)",
    )
    pricing_model_preference: str | None = Field(
        None,
        description="Pricing model: 'per_subject', 'tiered', or 'per_programme' (must be explicit, no 'auto')",
    )
    enabled_programme_type_ids: list[int] = Field(
        default_factory=list,
        description="Programme type nodes enabled for registration (exact match). Defaults to root if empty at API layer.",
    )
    # Legacy optional fields for backward-compatible clients (ignored when FKs provided)
    exam_type: str | None = None
    exam_series: str | None = None
    registration_period: ExamRegistrationPeriodCreate


class RegistrationExamUpdate(BaseModel):
    """Schema for updating a registration exam."""

    exam_id_main_system: int | None = None
    programme_type_id: int | None = None
    exam_series_id: int | None = None
    year: int | None = None
    description: str | None = None
    exam_kind: str | None = Field(None, description="Examination kind: 'school' or 'private'")
    allows_referral_registration: bool | None = Field(
        None,
        description="Whether referral candidates may register (school exams only)",
    )
    pricing_model_preference: str | None = Field(
        None,
        description="Pricing model: 'per_subject', 'tiered', or 'per_programme' (must be explicit, no 'auto')",
    )
    enabled_programme_type_ids: list[int] | None = None
    # Legacy optional fields
    exam_type: str | None = None
    exam_series: str | None = None


class RegistrationExamResponse(BaseModel):
    """Schema for registration exam response."""

    id: int
    exam_id_main_system: int | None = None
    exam_type: str
    exam_series: str | None = None
    programme_type_id: int | None = None
    exam_series_id: int | None = None
    programme_type_name: str | None = None
    exam_series_short_name: str | None = None
    exam_series_long_name: str | None = None
    enabled_programme_type_ids: list[int] = Field(default_factory=list)
    year: int
    description: str | None = None
    exam_kind: str = ExamKind.SCHOOL.value
    allows_referral_registration: bool = True
    # Present on school-facing exam list: whether current school may register free_tvet
    allows_free_tvet: bool | None = None
    registration_period: ExamRegistrationPeriodResponse
    results_published: bool = False
    results_published_at: datetime | None = None
    results_published_by_user_id: str | None = None
    pricing_model_preference: str | None = None
    has_index_numbers: bool = False
    candidate_count: int | None = None
    approved_candidates: int | None = None
    eligible_school_count: int | None = None
    # School-facing: optional self-declared expected registration total for this school×exam
    expected_total: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("results_published_by_user_id", mode="before")
    @classmethod
    def convert_uuid_to_string(cls, v):
        """Convert UUID to string if it's a UUID object."""
        if v is None:
            return None
        if isinstance(v, UUID):
            return str(v)
        return v


class ExamEligibleSchoolsUpdate(BaseModel):
    """Replace the set of schools eligible to register for an exam."""

    school_ids: list[int] = Field(default_factory=list)
    free_tvet_school_ids: list[int] = Field(
        default_factory=list,
        description="Subset of school_ids that may register Free TVET candidates for this exam",
    )


class LateRegistrationWindowCreate(BaseModel):
    """Create a late registration window. Empty/null school_ids = all eligible schools."""

    starts_at: datetime
    ends_at: datetime
    school_ids: list[int] | None = None
    note: str | None = Field(None, max_length=1000)


class LateRegistrationWindowSchoolItem(BaseModel):
    school_id: int
    school_code: str
    school_name: str

    model_config = ConfigDict(from_attributes=True)


class LateRegistrationWindowResponse(BaseModel):
    id: int
    exam_id: int
    starts_at: datetime
    ends_at: datetime
    is_active: bool
    note: str | None = None
    applies_to_all_eligible: bool
    schools: list[LateRegistrationWindowSchoolItem] = Field(default_factory=list)
    school_count: int = 0
    created_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


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


class PhotoValidationJobResponse(BaseModel):
    """Schema for photo validation job response."""

    id: int
    status: str  # "pending", "processing", "completed", "failed"
    validation_level: str  # "basic", "standard", "strict"
    progress_current: int
    progress_total: int
    total_photos: int
    valid_count: int
    invalid_count: int
    result_zip_path: str | None
    error_message: str | None
    school_id: int | None
    created_by_user_id: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    @field_validator('created_by_user_id', mode='before')
    @classmethod
    def convert_uuid_to_string(cls, v):
        """Convert UUID to string if it's a UUID object."""
        if v is None:
            return None
        if isinstance(v, UUID):
            return str(v)
        return v

    model_config = ConfigDict(from_attributes=True)


class ExamStatisticsResponse(BaseModel):
    """Schema for exam statistics response."""

    total_candidates: int
    approved_candidates: int
    completion_percentage: float
    schools_count: int
    days_to_end: int | None

    model_config = ConfigDict(from_attributes=True)


class DuplicateCandidateSummary(BaseModel):
    """Candidate fields shown in duplicate match groups / side-by-side compare."""

    id: int
    firstname: str
    lastname: str
    othername: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    programme_id: int | None = None
    programme_code: str | None = None
    registration_number: str
    index_number: str | None = None
    registration_status: RegistrationStatus
    fee_payment_status: FeePaymentStatus = FeePaymentStatus.UNPAID
    contact_email: str | None = None
    contact_phone: str | None = None
    national_id: str | None = None
    registration_type: str | None = None
    subject_selections: list[RegistrationSubjectSelectionResponse] = []
    has_photo: bool = False
    can_remove: bool = False
    remove_blocked_reason: str | None = None

    @computed_field
    def name(self) -> str:
        parts = [self.firstname]
        if self.othername:
            parts.append(self.othername)
        parts.append(self.lastname)
        return " ".join(parts)

    model_config = ConfigDict(from_attributes=True)


class DuplicateMatchGroup(BaseModel):
    """A cluster of likely duplicate candidates for one school × exam."""

    group_id: int
    best_score: float
    match_reasons: list[str] = Field(default_factory=list)
    candidates: list[DuplicateCandidateSummary]


class DuplicateMatchesResponse(BaseModel):
    """Response for school duplicate registration scan."""

    exam_id: int
    groups: list[DuplicateMatchGroup]
    threshold: float
    same_programme: bool
    same_dob: bool = True


class CandidateNotDuplicateCreate(BaseModel):
    """Mark two candidates as not duplicates of each other."""

    candidate_a_id: int
    candidate_b_id: int
