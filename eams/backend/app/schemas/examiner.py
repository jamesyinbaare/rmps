"""Examiner application schemas."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.models import (
    DegreeType,
    ExaminerApplicationStatus,
    ExaminerDocumentType,
    ExaminerSubjectPreferenceType,
    GhanaRegion,
    PaymentStatus,
    TeachingLevel,
)
from app.schemas.subject import SubjectResponse


# Nested schemas for related objects
class QualificationUpdate(BaseModel):
    """Qualification data for update."""

    university_college: str
    degree_type: DegreeType
    programme: str | None = None
    class_of_degree: str | None = None
    major_subjects: str | None = None
    date_of_award: date | None = None


class TeachingExperienceUpdate(BaseModel):
    """Teaching experience data for update."""

    institution_name: str
    date_from: date | None = None
    date_to: date | None = None
    subject: str | None = None
    level: TeachingLevel | None = None


class WorkExperienceUpdate(BaseModel):
    """Work experience data for update."""

    occupation: str
    employer_name: str
    date_from: date | None = None
    date_to: date | None = None
    position_held: str | None = None


class ExaminingExperienceUpdate(BaseModel):
    """Examining experience data for update."""

    examination_body: str
    subject: str | None = None
    level: str | None = None
    status: str | None = None
    date_from: date | None = None
    date_to: date | None = None


class TrainingCourseUpdate(BaseModel):
    """Training course data for update."""

    organizer: str
    course_name: str
    place: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    reason_for_participation: str | None = None


class ExaminerApplicationCreate(BaseModel):
    """Create examiner application request."""

    # Personal Particulars
    full_name: str
    title: str
    region: GhanaRegion
    nationality: str | None = None
    date_of_birth: date | None = None
    office_address: str | None = None
    residential_address: str | None = None
    email_address: EmailStr | None = None
    telephone_office: str | None = None
    telephone_cell: str | None = None
    present_school_institution: str | None = None
    present_rank_position: str | None = None
    subject_area: str | None = None
    subject_id: UUID | None = None
    additional_information: str | None = None
    ceased_examining_explanation: str | None = None


class ExaminerApplicationUpdate(BaseModel):
    """Update examiner application request."""

    full_name: str | None = None
    title: str | None = None
    region: GhanaRegion | None = None
    nationality: str | None = None
    date_of_birth: date | None = None
    office_address: str | None = None
    residential_address: str | None = None
    email_address: EmailStr | None = None
    telephone_office: str | None = None
    telephone_cell: str | None = None
    present_school_institution: str | None = None
    present_rank_position: str | None = None
    subject_area: str | None = None
    subject_id: UUID | None = None
    additional_information: str | None = None
    ceased_examining_explanation: str | None = None
    last_completed_step: int | None = None
    # Nested related objects
    qualifications: list[QualificationUpdate] | None = None
    teaching_experiences: list[TeachingExperienceUpdate] | None = None
    work_experiences: list[WorkExperienceUpdate] | None = None
    examining_experiences: list[ExaminingExperienceUpdate] | None = None
    training_courses: list[TrainingCourseUpdate] | None = None


class QualificationResponse(BaseModel):
    """Qualification response."""

    id: UUID
    university_college: str
    degree_type: DegreeType
    programme: str | None
    class_of_degree: str | None
    major_subjects: str | None
    date_of_award: date | None
    order_index: int

    class Config:
        from_attributes = True


class TeachingExperienceResponse(BaseModel):
    """Teaching experience response."""

    id: UUID
    institution_name: str
    date_from: date | None
    date_to: date | None
    subject: str | None
    level: TeachingLevel | None
    order_index: int

    class Config:
        from_attributes = True


class WorkExperienceResponse(BaseModel):
    """Work experience response."""

    id: UUID
    occupation: str
    employer_name: str
    date_from: date | None
    date_to: date | None
    position_held: str | None
    order_index: int

    class Config:
        from_attributes = True


class ExaminingExperienceResponse(BaseModel):
    """Examining experience response."""

    id: UUID
    examination_body: str
    subject: str | None
    level: str | None
    status: str | None
    date_from: date | None
    date_to: date | None
    order_index: int

    class Config:
        from_attributes = True


class TrainingCourseResponse(BaseModel):
    """Training course response."""

    id: UUID
    organizer: str
    course_name: str
    place: str | None
    date_from: date | None
    date_to: date | None
    reason_for_participation: str | None
    order_index: int

    class Config:
        from_attributes = True


class ExaminerApplicationDocumentResponse(BaseModel):
    """Examiner application document response."""

    id: UUID
    application_id: UUID
    document_type: ExaminerDocumentType
    file_name: str
    file_size: int
    mime_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


class ExaminerRecommendationStatus(BaseModel):
    """Summary of recommendation for examiner view (no recommendation details)."""

    completed: bool
    recommender_name: str | None = None


class ExaminerApplicationResponse(BaseModel):
    """Examiner application response."""

    id: UUID
    examiner_id: UUID
    application_number: str
    status: ExaminerApplicationStatus
    full_name: str
    title: str | None
    region: GhanaRegion | None
    nationality: str | None
    date_of_birth: date | None
    office_address: str | None
    residential_address: str | None
    email_address: str | None
    telephone_office: str | None
    telephone_cell: str | None
    present_school_institution: str | None
    present_rank_position: str | None
    subject_area: str | None
    subject_id: UUID | None = None
    additional_information: str | None
    ceased_examining_explanation: str | None
    payment_status: PaymentStatus | None
    submitted_at: datetime | None
    last_completed_step: int | None
    created_at: datetime
    updated_at: datetime
    # Nested relationships
    qualifications: list[QualificationResponse] = []
    teaching_experiences: list[TeachingExperienceResponse] = []
    work_experiences: list[WorkExperienceResponse] = []
    examining_experiences: list[ExaminingExperienceResponse] = []
    training_courses: list[TrainingCourseResponse] = []
    documents: list[ExaminerApplicationDocumentResponse] = []
    recommendation_status: ExaminerRecommendationStatus | None = None
    recommendation: "ExaminerRecommendationResponse | None" = None  # Full details (e.g. for admin view)
    subject: SubjectResponse | None = None

    class Config:
        from_attributes = True


class ExaminerMeResponse(BaseModel):
    """Examiner profile summary for GET /examiner/me."""

    examiner_id: UUID
    full_name: str
    email_address: str | None = None

    class Config:
        from_attributes = True


class ExaminerRecommendationTokenRequest(BaseModel):
    """Request recommendation token."""

    recommender_email: EmailStr
    recommender_name: str


class ExaminerRecommendationCreate(BaseModel):
    """Create examiner recommendation."""

    recommender_name: str
    recommender_status: str | None = None
    recommender_office_address: str | None = None
    recommender_phone: str | None = None
    quality_ratings: dict[str, int] | None = None  # {quality_name: rating (1-6)}
    recommendation_decision: bool  # True = recommend, False = do not recommend
    recommender_signature: str | None = None
    recommender_date: date | None = None


class ExaminerRecommendationResponse(BaseModel):
    """Examiner recommendation response."""

    id: UUID
    application_id: UUID
    applicant_name: str | None = None
    recommender_name: str | None
    recommender_status: str | None
    recommender_office_address: str | None
    recommender_phone: str | None
    quality_ratings: dict[str, int] | None
    recommendation_decision: bool | None
    recommender_signature: str | None
    recommender_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
