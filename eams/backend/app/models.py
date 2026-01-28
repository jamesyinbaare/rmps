"""Database models - all models and enums in a single module."""
import enum
from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.dependencies.database import Base


# -----------------------------------------------------------------------------
# Enums
# -----------------------------------------------------------------------------


class UserRole(enum.IntEnum):
    """User roles with hierarchical permissions. Lower values have higher privileges."""

    SYSTEM_ADMIN = 0
    ADMIN = 10
    EXAMINER = 20

    def __lt__(self, other: "UserRole") -> bool:
        return self.value < other.value

    def __le__(self, other: "UserRole") -> bool:
        return self.value <= other.value

    def __gt__(self, other: "UserRole") -> bool:
        return self.value > other.value

    def __ge__(self, other: "UserRole") -> bool:
        return self.value >= other.value


class ExaminerApplicationStatus(enum.Enum):
    """Examiner application status."""

    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class ExaminerDocumentType(enum.Enum):
    """Examiner document types."""

    PHOTOGRAPH = "PHOTOGRAPH"
    CERTIFICATE = "CERTIFICATE"
    TRANSCRIPT = "TRANSCRIPT"


class ExaminerSubjectPreferenceType(enum.Enum):
    """Examiner subject preference types."""

    ELECTIVE = "ELECTIVE"
    CORE = "CORE"
    TECHNICAL_DRAWING_BUILDING = "TECHNICAL_DRAWING_BUILDING"
    TECHNICAL_DRAWING_MECHANICAL = "TECHNICAL_DRAWING_MECHANICAL"
    PRACTICAL_COMPONENT = "PRACTICAL_COMPONENT"
    ACCESS_COURSE = "ACCESS_COURSE"


class ExaminerStatus(enum.Enum):
    """Examiner status."""

    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"


class MarkingCycleStatus(enum.Enum):
    """Marking cycle status."""

    DRAFT = "DRAFT"
    OPEN = "OPEN"
    ALLOCATED = "ALLOCATED"
    CLOSED = "CLOSED"


class AllocationStatus(enum.Enum):
    """Examiner allocation status."""

    APPROVED = "APPROVED"
    WAITLISTED = "WAITLISTED"
    REJECTED = "REJECTED"


class AcceptanceStatus(enum.Enum):
    """Examiner acceptance status."""

    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"
    EXPIRED = "EXPIRED"


class QuotaType(enum.Enum):
    """Quota type."""

    REGION = "REGION"
    GENDER = "GENDER"


class PaymentStatus(enum.Enum):
    """Payment status."""

    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


# -----------------------------------------------------------------------------
# User
# -----------------------------------------------------------------------------


class User(Base):
    """User model for authentication and authorization."""

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    _role = Column("role", Integer, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examiner = relationship("Examiner", back_populates="user", uselist=False)

    @property
    def role(self) -> UserRole:
        return UserRole(self._role)

    @role.setter
    def role(self, value: UserRole | int) -> None:
        self._role = int(value) if isinstance(value, UserRole) else value


# -----------------------------------------------------------------------------
# Subject
# -----------------------------------------------------------------------------


class Subject(Base):
    """Subject master data."""

    __tablename__ = "subjects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    eligibilities = relationship("ExaminerSubjectEligibility", back_populates="subject", cascade="all, delete-orphan")
    history = relationship("ExaminerSubjectHistory", back_populates="subject", cascade="all, delete-orphan")
    cycles = relationship("MarkingCycle", back_populates="subject", cascade="all, delete-orphan")
    quotas = relationship("SubjectQuota", back_populates="subject", cascade="all, delete-orphan")
    allocations = relationship("ExaminerAllocation", back_populates="subject", cascade="all, delete-orphan")
    acceptances = relationship("ExaminerAcceptance", back_populates="subject", cascade="all, delete-orphan")


# -----------------------------------------------------------------------------
# Examiner
# -----------------------------------------------------------------------------


class Examiner(Base):
    """Core examiner profile (persistent, not per-application)."""

    __tablename__ = "examiners"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    full_name = Column(String(255), nullable=False)
    title = Column(String(20), nullable=True)
    gender = Column(String(20), nullable=True)
    region = Column(String(100), nullable=True)
    nationality = Column(String(100), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    office_address = Column(Text, nullable=True)
    residential_address = Column(Text, nullable=True)
    email_address = Column(String(255), nullable=True)
    telephone_office = Column(String(50), nullable=True)
    telephone_cell = Column(String(50), nullable=True)
    present_school_institution = Column(String(255), nullable=True)
    present_rank_position = Column(String(255), nullable=True)

    status = Column(Enum(ExaminerStatus, create_constraint=False, values_callable=lambda x: [e.value for e in x]), default=ExaminerStatus.ACTIVE, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="examiner")
    qualifications = relationship("ExaminerQualification", back_populates="examiner", cascade="all, delete-orphan", order_by="ExaminerQualification.order_index")
    teaching_experiences = relationship("ExaminerTeachingExperience", back_populates="examiner", cascade="all, delete-orphan", order_by="ExaminerTeachingExperience.order_index")
    work_experiences = relationship("ExaminerWorkExperience", back_populates="examiner", cascade="all, delete-orphan", order_by="ExaminerWorkExperience.order_index")
    examining_experiences = relationship("ExaminerExaminingExperience", back_populates="examiner", cascade="all, delete-orphan", order_by="ExaminerExaminingExperience.order_index")
    training_courses = relationship("ExaminerTrainingCourse", back_populates="examiner", cascade="all, delete-orphan", order_by="ExaminerTrainingCourse.order_index")
    documents = relationship("ExaminerDocument", back_populates="examiner", cascade="all, delete-orphan")
    subject_eligibilities = relationship("ExaminerSubjectEligibility", back_populates="examiner", cascade="all, delete-orphan")
    subject_history = relationship("ExaminerSubjectHistory", back_populates="examiner", cascade="all, delete-orphan")
    applications = relationship("ExaminerApplication", back_populates="examiner", cascade="all, delete-orphan")
    allocations = relationship("ExaminerAllocation", back_populates="examiner", cascade="all, delete-orphan")
    acceptances = relationship("ExaminerAcceptance", back_populates="examiner", cascade="all, delete-orphan")


class ExaminerQualification(Base):
    """Academic qualifications."""

    __tablename__ = "examiner_qualifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    university_college = Column(String(255), nullable=False)
    degree_diploma = Column(String(255), nullable=False)
    class_of_degree = Column(String(100), nullable=True)
    major_subjects = Column(Text, nullable=True)
    date_of_award = Column(Date, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    examiner = relationship("Examiner", back_populates="qualifications")


class ExaminerTeachingExperience(Base):
    """Teaching experience."""

    __tablename__ = "examiner_teaching_experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    institution_name = Column(String(255), nullable=False)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    subject = Column(String(255), nullable=True)
    level = Column(String(100), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    examiner = relationship("Examiner", back_populates="teaching_experiences")


class ExaminerWorkExperience(Base):
    """Work experience other than teaching."""

    __tablename__ = "examiner_work_experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    occupation = Column(String(255), nullable=False)
    employer_name = Column(String(255), nullable=False)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    position_held = Column(String(255), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    examiner = relationship("Examiner", back_populates="work_experiences")


class ExaminerExaminingExperience(Base):
    """Previous examining experience."""

    __tablename__ = "examiner_examining_experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    examination_body = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=True)
    level = Column(String(100), nullable=True)
    status = Column(String(100), nullable=True)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    examiner = relationship("Examiner", back_populates="examining_experiences")


class ExaminerTrainingCourse(Base):
    """Training courses."""

    __tablename__ = "examiner_training_courses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    organizer = Column(String(255), nullable=False)
    course_name = Column(String(255), nullable=False)
    place = Column(String(255), nullable=True)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    reason_for_participation = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    examiner = relationship("Examiner", back_populates="training_courses")


class ExaminerDocument(Base):
    """Uploaded documents (photographs, certificates, transcripts)."""

    __tablename__ = "examiner_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type = Column(Enum(ExaminerDocumentType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    file_path = Column(String(512), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    examiner = relationship("Examiner", back_populates="documents")


# -----------------------------------------------------------------------------
# Subject eligibility / history
# -----------------------------------------------------------------------------


class ExaminerSubjectEligibility(Base):
    """Subject-specific eligibility per examiner (tracks 'apply once per subject' requirement)."""

    __tablename__ = "examiner_subject_eligibility"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    eligible = Column(Boolean, default=True, nullable=False, index=True)
    date_added = Column(Date, default=date.today, nullable=False)

    examiner = relationship("Examiner", back_populates="subject_eligibilities")
    subject = relationship("Subject", back_populates="eligibilities")

    __table_args__ = (UniqueConstraint("examiner_id", "subject_id", name="uq_examiner_subject_eligibility"),)


class ExaminerSubjectHistory(Base):
    """Historical marking records (used for experience scoring)."""

    __tablename__ = "examiner_subject_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    times_marked = Column(Integer, default=0, nullable=False)
    last_marked_year = Column(Integer, nullable=True)

    examiner = relationship("Examiner", back_populates="subject_history")
    subject = relationship("Subject", back_populates="history")

    __table_args__ = (UniqueConstraint("examiner_id", "subject_id", name="uq_examiner_subject_history"),)


# -----------------------------------------------------------------------------
# Allocation
# -----------------------------------------------------------------------------


class MarkingCycle(Base):
    """Annual marking cycle configuration."""

    __tablename__ = "marking_cycles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    year = Column(Integer, nullable=False, index=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    total_required = Column(Integer, nullable=False)
    experience_ratio = Column(Float, nullable=False)
    acceptance_deadline = Column(DateTime, nullable=True)
    status = Column(Enum(MarkingCycleStatus, create_constraint=False, values_callable=lambda x: [e.value for e in x]), default=MarkingCycleStatus.DRAFT, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    subject = relationship("Subject", back_populates="cycles")
    quotas = relationship("SubjectQuota", back_populates="cycle", cascade="all, delete-orphan")
    allocations = relationship("ExaminerAllocation", back_populates="cycle", cascade="all, delete-orphan")
    acceptances = relationship("ExaminerAcceptance", back_populates="cycle", cascade="all, delete-orphan")
    audit_logs = relationship("AllocationAuditLog", back_populates="cycle", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("year", "subject_id", name="uq_marking_cycle_year_subject"),)


class SubjectQuota(Base):
    """Quota configuration per cycle."""

    __tablename__ = "subject_quotas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    cycle_id = Column(UUID(as_uuid=True), ForeignKey("marking_cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    quota_type = Column(Enum(QuotaType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    quota_key = Column(String(100), nullable=False)
    min_count = Column(Integer, nullable=True)
    max_count = Column(Integer, nullable=True)
    percentage = Column(Float, nullable=True)

    cycle = relationship("MarkingCycle", back_populates="quotas")
    subject = relationship("Subject", back_populates="quotas")

    __table_args__ = (UniqueConstraint("cycle_id", "subject_id", "quota_type", "quota_key", name="uq_subject_quota"),)


class ExaminerAllocation(Base):
    """Allocation results."""

    __tablename__ = "examiner_allocations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id = Column(UUID(as_uuid=True), ForeignKey("marking_cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    score = Column(Float, nullable=True)
    rank = Column(Integer, nullable=True)
    allocation_status = Column(Enum(AllocationStatus, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    allocated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    allocated_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    examiner = relationship("Examiner", back_populates="allocations")
    cycle = relationship("MarkingCycle", back_populates="allocations")
    subject = relationship("Subject", back_populates="allocations")
    allocated_by_user = relationship("User", foreign_keys=[allocated_by_user_id])
    acceptance = relationship("ExaminerAcceptance", back_populates="allocation", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("examiner_id", "cycle_id", "subject_id", name="uq_examiner_allocation"),)


class ExaminerAcceptance(Base):
    """Acceptance/decline tracking."""

    __tablename__ = "examiner_acceptances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id = Column(UUID(as_uuid=True), ForeignKey("marking_cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    allocation_id = Column(UUID(as_uuid=True), ForeignKey("examiner_allocations.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(Enum(AcceptanceStatus, create_constraint=False, values_callable=lambda x: [e.value for e in x]), default=AcceptanceStatus.PENDING, nullable=False, index=True)
    notified_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    response_deadline = Column(DateTime, nullable=False)

    examiner = relationship("Examiner", back_populates="acceptances")
    cycle = relationship("MarkingCycle", back_populates="acceptances")
    subject = relationship("Subject", back_populates="acceptances")
    allocation = relationship("ExaminerAllocation", back_populates="acceptance")

    __table_args__ = (UniqueConstraint("examiner_id", "cycle_id", "subject_id", name="uq_examiner_acceptance"),)


class AllocationAuditLog(Base):
    """Audit trail for all allocation actions."""

    __tablename__ = "allocation_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    action_type = Column(String(100), nullable=False, index=True)
    performed_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False, index=True)
    cycle_id = Column(UUID(as_uuid=True), ForeignKey("marking_cycles.id", ondelete="CASCADE"), nullable=True, index=True)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=True, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=True, index=True)
    allocation_id = Column(UUID(as_uuid=True), ForeignKey("examiner_allocations.id", ondelete="CASCADE"), nullable=True, index=True)
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    performed_by_user = relationship("User", foreign_keys=[performed_by_user_id])
    cycle = relationship("MarkingCycle", back_populates="audit_logs")


# -----------------------------------------------------------------------------
# Application
# -----------------------------------------------------------------------------


class ExaminerApplication(Base):
    """Model for examiner application (Section A)."""

    __tablename__ = "examiner_applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    application_number = Column(String(50), unique=True, nullable=False, index=True)
    status = Column(Enum(ExaminerApplicationStatus, create_constraint=False, values_callable=lambda x: [e.value for e in x]), default=ExaminerApplicationStatus.DRAFT, nullable=False, index=True)

    full_name = Column(String(255), nullable=False)
    title = Column(String(20), nullable=True)
    nationality = Column(String(100), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    office_address = Column(Text, nullable=True)
    residential_address = Column(Text, nullable=True)
    email_address = Column(String(255), nullable=True)
    telephone_office = Column(String(50), nullable=True)
    telephone_cell = Column(String(50), nullable=True)
    present_school_institution = Column(String(255), nullable=True)
    present_rank_position = Column(String(255), nullable=True)

    subject_area = Column(Text, nullable=True)
    additional_information = Column(Text, nullable=True)
    ceased_examining_explanation = Column(Text, nullable=True)

    payment_status = Column(Enum(PaymentStatus, create_constraint=False, values_callable=lambda x: [e.name for e in x]), nullable=True, index=True)
    submitted_at = Column(DateTime, nullable=True, index=True)
    last_completed_step = Column(Integer, nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examiner = relationship("Examiner", back_populates="applications")
    qualifications = relationship("ExaminerApplicationQualification", back_populates="application", cascade="all, delete-orphan", order_by="ExaminerApplicationQualification.order_index")
    teaching_experiences = relationship("ExaminerApplicationTeachingExperience", back_populates="application", cascade="all, delete-orphan", order_by="ExaminerApplicationTeachingExperience.order_index")
    work_experiences = relationship("ExaminerApplicationWorkExperience", back_populates="application", cascade="all, delete-orphan", order_by="ExaminerApplicationWorkExperience.order_index")
    examining_experiences = relationship("ExaminerApplicationExaminingExperience", back_populates="application", cascade="all, delete-orphan", order_by="ExaminerApplicationExaminingExperience.order_index")
    training_courses = relationship("ExaminerApplicationTrainingCourse", back_populates="application", cascade="all, delete-orphan", order_by="ExaminerApplicationTrainingCourse.order_index")
    subject_preferences = relationship("ExaminerApplicationSubjectPreference", back_populates="application", cascade="all, delete-orphan")
    documents = relationship("ExaminerApplicationDocument", back_populates="application", cascade="all, delete-orphan")
    recommendation = relationship("ExaminerRecommendation", back_populates="application", uselist=False, cascade="all, delete-orphan")
    processing = relationship("ExaminerApplicationProcessing", back_populates="application", uselist=False, cascade="all, delete-orphan")


class ExaminerApplicationQualification(Base):
    """Model for academic qualifications in application (Section A, Q8)."""

    __tablename__ = "examiner_application_qualifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    university_college = Column(String(255), nullable=False)
    degree_diploma = Column(String(255), nullable=False)
    class_of_degree = Column(String(100), nullable=True)
    major_subjects = Column(Text, nullable=True)
    date_of_award = Column(Date, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    application = relationship("ExaminerApplication", back_populates="qualifications")


class ExaminerApplicationTeachingExperience(Base):
    """Model for teaching experience in application (Section A, Q9)."""

    __tablename__ = "examiner_application_teaching_experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    institution_name = Column(String(255), nullable=False)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    subject = Column(String(255), nullable=True)
    level = Column(String(100), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    application = relationship("ExaminerApplication", back_populates="teaching_experiences")


class ExaminerApplicationWorkExperience(Base):
    """Model for work experience in application (Section A, Q10)."""

    __tablename__ = "examiner_application_work_experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    occupation = Column(String(255), nullable=False)
    employer_name = Column(String(255), nullable=False)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    position_held = Column(String(255), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    application = relationship("ExaminerApplication", back_populates="work_experiences")


class ExaminerApplicationExaminingExperience(Base):
    """Model for examining experience in application (Section A, Q11)."""

    __tablename__ = "examiner_application_examining_experiences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    examination_body = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=True)
    level = Column(String(100), nullable=True)
    status = Column(String(100), nullable=True)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    application = relationship("ExaminerApplication", back_populates="examining_experiences")


class ExaminerApplicationTrainingCourse(Base):
    """Model for training courses in application (Section A, Q13)."""

    __tablename__ = "examiner_application_training_courses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    organizer = Column(String(255), nullable=False)
    course_name = Column(String(255), nullable=False)
    place = Column(String(255), nullable=True)
    date_from = Column(Date, nullable=True)
    date_to = Column(Date, nullable=True)
    reason_for_participation = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)

    application = relationship("ExaminerApplication", back_populates="training_courses")


class ExaminerApplicationSubjectPreference(Base):
    """Model for subject preferences in application (Section A, Q7)."""

    __tablename__ = "examiner_application_subject_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    preference_type = Column(Enum(ExaminerSubjectPreferenceType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False)
    subject_area = Column(Text, nullable=True)

    application = relationship("ExaminerApplication", back_populates="subject_preferences")


class ExaminerApplicationDocument(Base):
    """Model for application documents (photographs, certificates, transcripts)."""

    __tablename__ = "examiner_application_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type = Column(Enum(ExaminerDocumentType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    file_path = Column(String(512), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    application = relationship("ExaminerApplication", back_populates="documents")


class ExaminerRecommendation(Base):
    """Model for official recommendation (Section B)."""

    __tablename__ = "examiner_recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    recommender_name = Column(String(255), nullable=True)
    recommender_status = Column(String(255), nullable=True)
    recommender_office_address = Column(Text, nullable=True)
    recommender_phone = Column(String(50), nullable=True)

    quality_ratings = Column(JSON, nullable=True)
    integrity_assessment = Column(Text, nullable=True)
    certification_statement = Column(Text, nullable=True)
    recommendation_decision = Column(Boolean, nullable=True)

    recommender_signature = Column(String(255), nullable=True)
    recommender_date = Column(Date, nullable=True)

    token = Column(String(64), unique=True, nullable=True, index=True)
    token_expires_at = Column(DateTime, nullable=True, index=True)
    completed_at = Column(DateTime, nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    application = relationship("ExaminerApplication", back_populates="recommendation")


class ExaminerApplicationProcessing(Base):
    """Model for office processing (Section C)."""

    __tablename__ = "examiner_application_processing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4, index=True)
    application_id = Column(UUID(as_uuid=True), ForeignKey("examiner_applications.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    checked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    received_date = Column(Date, nullable=True)

    certificate_types = Column(JSON, nullable=True)
    certificates_checked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    certificates_checked_date = Column(Date, nullable=True)

    accepted_first_invitation_date = Column(Date, nullable=True)
    accepted_subject = Column(String(255), nullable=True)
    accepted_officer_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    accepted_date = Column(Date, nullable=True)

    rejected_reasons = Column(Text, nullable=True)
    rejected_officer_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    rejected_date = Column(Date, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    application = relationship("ExaminerApplication", back_populates="processing")
    checked_by_user = relationship("User", foreign_keys=[checked_by_user_id])
    certificates_checked_by_user = relationship("User", foreign_keys=[certificates_checked_by_user_id])
    accepted_officer_user = relationship("User", foreign_keys=[accepted_officer_user_id])
    rejected_officer_user = relationship("User", foreign_keys=[rejected_officer_user_id])


__all__ = [
    "User",
    "UserRole",
    "Examiner",
    "ExaminerQualification",
    "ExaminerTeachingExperience",
    "ExaminerWorkExperience",
    "ExaminerExaminingExperience",
    "ExaminerTrainingCourse",
    "ExaminerDocument",
    "Subject",
    "ExaminerSubjectEligibility",
    "ExaminerSubjectHistory",
    "MarkingCycle",
    "SubjectQuota",
    "ExaminerAllocation",
    "ExaminerAcceptance",
    "AllocationAuditLog",
    "ExaminerApplication",
    "ExaminerApplicationQualification",
    "ExaminerApplicationTeachingExperience",
    "ExaminerApplicationWorkExperience",
    "ExaminerApplicationExaminingExperience",
    "ExaminerApplicationTrainingCourse",
    "ExaminerApplicationSubjectPreference",
    "ExaminerApplicationDocument",
    "ExaminerRecommendation",
    "ExaminerApplicationProcessing",
    "ExaminerStatus",
    "ExaminerApplicationStatus",
    "ExaminerDocumentType",
    "ExaminerSubjectPreferenceType",
    "MarkingCycleStatus",
    "AllocationStatus",
    "AcceptanceStatus",
    "QuotaType",
    "PaymentStatus",
]
