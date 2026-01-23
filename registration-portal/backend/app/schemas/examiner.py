"""Schemas for examiner application module."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models import (
    ExaminerApplicationStatus,
    ExaminerDocumentType,
    ExaminerSubjectPreferenceType,
    PaymentStatus,
)


# Base schemas
class ExaminerAcademicQualificationBase(BaseModel):
    university_college: str = Field(..., min_length=1, max_length=255)
    degree_diploma: str = Field(..., min_length=1, max_length=255)
    class_of_degree: str | None = Field(None, max_length=100)
    major_subjects: str | None = None
    date_of_award: date | None = None
    order_index: int = Field(default=0, ge=0)


class ExaminerTeachingExperienceBase(BaseModel):
    institution_name: str = Field(..., min_length=1, max_length=255)
    date_from: date | None = None
    date_to: date | None = None
    subject: str | None = Field(None, max_length=255)
    level: str | None = Field(None, max_length=100)
    order_index: int = Field(default=0, ge=0)


class ExaminerWorkExperienceBase(BaseModel):
    occupation: str = Field(..., min_length=1, max_length=255)
    employer_name: str = Field(..., min_length=1, max_length=255)
    date_from: date | None = None
    date_to: date | None = None
    position_held: str | None = Field(None, max_length=255)
    order_index: int = Field(default=0, ge=0)


class ExaminerExaminingExperienceBase(BaseModel):
    examination_body: str = Field(..., min_length=1, max_length=255)
    subject: str | None = Field(None, max_length=255)
    level: str | None = Field(None, max_length=100)
    status: str | None = Field(None, max_length=100)  # Assist. Examiner, Team Leader, etc.
    date_from: date | None = None
    date_to: date | None = None
    order_index: int = Field(default=0, ge=0)


class ExaminerTrainingCourseBase(BaseModel):
    organizer: str = Field(..., min_length=1, max_length=255)
    course_name: str = Field(..., min_length=1, max_length=255)
    place: str | None = Field(None, max_length=255)
    date_from: date | None = None
    date_to: date | None = None
    reason_for_participation: str | None = None
    order_index: int = Field(default=0, ge=0)


class ExaminerSubjectPreferenceBase(BaseModel):
    preference_type: ExaminerSubjectPreferenceType
    subject_area: str | None = None


class ExaminerApplicationBase(BaseModel):
    # Personal Particulars
    full_name: str = Field(..., min_length=1, max_length=255)
    title: str | None = Field(None, max_length=20)
    nationality: str | None = Field(None, max_length=100)
    date_of_birth: date | None = None
    office_address: str | None = None
    residential_address: str | None = None
    email_address: EmailStr | None = None
    telephone_office: str | None = Field(None, max_length=50)
    telephone_cell: str | None = Field(None, max_length=50)
    present_school_institution: str | None = Field(None, max_length=255)
    present_rank_position: str | None = Field(None, max_length=255)

    # Subject preferences
    subject_area: str | None = None

    # Additional information
    additional_information: str | None = None
    ceased_examining_explanation: str | None = None


# Create schemas
class ExaminerAcademicQualificationCreate(ExaminerAcademicQualificationBase):
    pass


class ExaminerTeachingExperienceCreate(ExaminerTeachingExperienceBase):
    pass


class ExaminerWorkExperienceCreate(ExaminerWorkExperienceBase):
    pass


class ExaminerExaminingExperienceCreate(ExaminerExaminingExperienceBase):
    pass


class ExaminerTrainingCourseCreate(ExaminerTrainingCourseBase):
    pass


class ExaminerSubjectPreferenceCreate(ExaminerSubjectPreferenceBase):
    pass


class ExaminerApplicationCreate(ExaminerApplicationBase):
    qualifications: list[ExaminerAcademicQualificationCreate] = Field(default_factory=list)
    teaching_experiences: list[ExaminerTeachingExperienceCreate] = Field(default_factory=list)
    work_experiences: list[ExaminerWorkExperienceCreate] = Field(default_factory=list)
    examining_experiences: list[ExaminerExaminingExperienceCreate] = Field(default_factory=list)
    training_courses: list[ExaminerTrainingCourseCreate] = Field(default_factory=list)
    subject_preferences: list[ExaminerSubjectPreferenceCreate] = Field(default_factory=list)


class ExaminerApplicationUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=255)
    title: str | None = Field(None, max_length=20)
    nationality: str | None = Field(None, max_length=100)
    date_of_birth: date | None = None
    office_address: str | None = None
    residential_address: str | None = None
    email_address: EmailStr | None = None
    telephone_office: str | None = Field(None, max_length=50)
    telephone_cell: str | None = Field(None, max_length=50)
    present_school_institution: str | None = Field(None, max_length=255)
    present_rank_position: str | None = Field(None, max_length=255)
    subject_area: str | None = None
    additional_information: str | None = None
    ceased_examining_explanation: str | None = None
    qualifications: list[ExaminerAcademicQualificationCreate] | None = None
    teaching_experiences: list[ExaminerTeachingExperienceCreate] | None = None
    work_experiences: list[ExaminerWorkExperienceCreate] | None = None
    examining_experiences: list[ExaminerExaminingExperienceCreate] | None = None
    training_courses: list[ExaminerTrainingCourseCreate] | None = None
    subject_preferences: list[ExaminerSubjectPreferenceCreate] | None = None


# Response schemas
class ExaminerAcademicQualificationResponse(ExaminerAcademicQualificationBase):
    id: int
    application_id: int

    model_config = ConfigDict(from_attributes=True)


class ExaminerTeachingExperienceResponse(ExaminerTeachingExperienceBase):
    id: int
    application_id: int

    model_config = ConfigDict(from_attributes=True)


class ExaminerWorkExperienceResponse(ExaminerWorkExperienceBase):
    id: int
    application_id: int

    model_config = ConfigDict(from_attributes=True)


class ExaminerExaminingExperienceResponse(ExaminerExaminingExperienceBase):
    id: int
    application_id: int

    model_config = ConfigDict(from_attributes=True)


class ExaminerTrainingCourseResponse(ExaminerTrainingCourseBase):
    id: int
    application_id: int

    model_config = ConfigDict(from_attributes=True)


class ExaminerSubjectPreferenceResponse(ExaminerSubjectPreferenceBase):
    id: int
    application_id: int

    model_config = ConfigDict(from_attributes=True)


class ExaminerApplicationDocumentResponse(BaseModel):
    id: int
    application_id: int
    document_type: ExaminerDocumentType
    file_path: str
    file_name: str
    mime_type: str
    file_size: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExaminerApplicationResponse(ExaminerApplicationBase):
    id: int
    applicant_id: UUID
    application_number: str
    status: ExaminerApplicationStatus
    payment_status: PaymentStatus | None
    invoice_id: int | None
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime

    qualifications: list[ExaminerAcademicQualificationResponse] = Field(default_factory=list)
    teaching_experiences: list[ExaminerTeachingExperienceResponse] = Field(default_factory=list)
    work_experiences: list[ExaminerWorkExperienceResponse] = Field(default_factory=list)
    examining_experiences: list[ExaminerExaminingExperienceResponse] = Field(default_factory=list)
    training_courses: list[ExaminerTrainingCourseResponse] = Field(default_factory=list)
    subject_preferences: list[ExaminerSubjectPreferenceResponse] = Field(default_factory=list)
    documents: list[ExaminerApplicationDocumentResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# Recommendation schemas (Section B)
class ExaminerRecommendationCreate(BaseModel):
    recommender_name: str = Field(..., min_length=1, max_length=255)
    recommender_status: str | None = Field(None, max_length=255)
    recommender_office_address: str | None = None
    recommender_phone: str | None = Field(None, max_length=50)
    quality_ratings: dict[str, int] | None = None  # {quality_name: rating (1-6)}
    integrity_assessment: str | None = None
    certification_statement: str | None = None
    recommendation_decision: bool  # True = recommend, False = do not recommend
    recommender_signature: str | None = Field(None, max_length=255)
    recommender_date: date | None = None


class ExaminerRecommendationResponse(BaseModel):
    id: int
    application_id: int
    recommender_name: str | None
    recommender_status: str | None
    recommender_office_address: str | None
    recommender_phone: str | None
    quality_ratings: dict[str, int] | None
    integrity_assessment: str | None
    certification_statement: str | None
    recommendation_decision: bool | None
    recommender_signature: str | None
    recommender_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExaminerRecommendationTokenRequest(BaseModel):
    recommender_email: EmailStr
    recommender_name: str = Field(..., min_length=1, max_length=255)


# Processing schemas (Section C)
class ExaminerApplicationProcessingCreate(BaseModel):
    checked_by_user_id: UUID | None = None
    received_date: date | None = None
    certificate_types: list[str] | None = None
    certificates_checked_by_user_id: UUID | None = None
    certificates_checked_date: date | None = None
    accepted_first_invitation_date: date | None = None
    accepted_subject: str | None = Field(None, max_length=255)
    accepted_officer_user_id: UUID | None = None
    accepted_date: date | None = None
    rejected_reasons: str | None = None
    rejected_officer_user_id: UUID | None = None
    rejected_date: date | None = None


class ExaminerApplicationProcessingResponse(BaseModel):
    id: int
    application_id: int
    checked_by_user_id: UUID | None
    received_date: date | None
    certificate_types: list[str] | None
    certificates_checked_by_user_id: UUID | None
    certificates_checked_date: date | None
    accepted_first_invitation_date: date | None
    accepted_subject: str | None
    accepted_officer_user_id: UUID | None
    accepted_date: date | None
    rejected_reasons: str | None
    rejected_officer_user_id: UUID | None
    rejected_date: date | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Submit request (includes all sections for final submission)
class ExaminerApplicationSubmitRequest(BaseModel):
    """Request to submit application - validates completeness before submission."""
    pass  # Uses same structure as ExaminerApplicationCreate, but triggers validation


# Document upload schemas
class ExaminerDocumentUploadResponse(BaseModel):
    document: ExaminerApplicationDocumentResponse
    message: str
