from datetime import datetime
import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.orm import relationship

from app.dependencies.database import Base


class Role(enum.IntEnum):
    """User roles with hierarchical permissions. Lower values have higher privileges."""
    SystemAdmin = 0
    Director = 10
    DeputyDirector = 20
    PrincipalManager = 30
    SeniorManager = 40
    Manager = 50
    Staff = 60
    SchoolAdmin = 70
    SchoolStaff = 80
    PublicUser = 90
    APIUSER = 100

    def __lt__(self, other: "Role") -> bool:
        return self.value < other.value

    def __le__(self, other: "Role") -> bool:
        return self.value <= other.value

    def __gt__(self, other: "Role") -> bool:
        return self.value > other.value

    def __ge__(self, other: "Role") -> bool:
        return self.value >= other.value


class RegistrationStatus(enum.Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ExportStatus(enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class SubjectType(enum.Enum):
    CORE = "CORE"
    ELECTIVE = "ELECTIVE"


class ExamType(enum.Enum):
    CERTIFICATE_II = "Certificate II Examinations"
    ADVANCE = "Advance"
    TECHNICIAN_PART_I = "Technician Part I"
    TECHNICIAN_PART_II = "Technician Part II"
    TECHNICIAN_PART_III = "Technician Part III"
    DIPLOMA = "Diploma"


class ExamSeries(enum.Enum):
    MAY_JUNE = "MAY/JUNE"
    NOV_DEC = "NOV/DEC"


class Grade(enum.Enum):
    FAIL = "Fail"
    PASS = "Pass"
    LOWER_CREDIT = "Lower Credit"
    CREDIT = "Credit"
    UPPER_CREDIT = "Upper Credit"
    DISTINCTION = "Distinction"
    BLOCKED = "Blocked"
    CANCELLED = "Cancelled"
    ABSENT = "Absent"


class ResultBlockType(enum.Enum):
    CANDIDATE_ALL = "CANDIDATE_ALL"
    CANDIDATE_SUBJECT = "CANDIDATE_SUBJECT"
    SCHOOL_ALL = "SCHOOL_ALL"
    SCHOOL_SUBJECT = "SCHOOL_SUBJECT"


class IndexNumberGenerationJobStatus(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class CertificateRequestType(enum.Enum):
    CERTIFICATE = "certificate"  # NOV/DEC only
    ATTESTATION = "attestation"  # All candidates
    CONFIRMATION = "confirmation"  # Certificate confirmation/verification
    VERIFICATION = "verification"  # Certificate verification


class RequestStatus(enum.Enum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    IN_PROCESS = "in_process"
    READY_FOR_DISPATCH = "ready_for_dispatch"
    DISPATCHED = "dispatched"
    RECEIVED = "received"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class DeliveryMethod(enum.Enum):
    PICKUP = "pickup"
    COURIER = "courier"


class PaymentStatus(enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TicketPriority(enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ServiceType(enum.Enum):
    STANDARD = "standard"
    EXPRESS = "express"


class TicketActivityType(enum.Enum):
    COMMENT = "comment"
    STATUS_CHANGE = "status_change"
    ASSIGNMENT = "assignment"
    NOTE = "note"
    SYSTEM = "system"


class CreditTransactionType(enum.Enum):
    PURCHASE = "purchase"
    ADMIN_ASSIGNMENT = "admin_assignment"
    USAGE = "usage"
    REFUND = "refund"


class ApiRequestSource(enum.Enum):
    API_KEY = "api_key"
    DASHBOARD = "dashboard"


class ApiRequestType(enum.Enum):
    SINGLE = "single"
    BULK = "bulk"


class Disability(enum.Enum):
    VISUAL = "Visual"
    AUDITORY = "Auditory"
    PHYSICAL = "Physical"
    COGNITIVE = "Cognitive"
    SPEECH = "Speech"
    OTHER = "Other"


class RegistrationType(enum.Enum):
    FREE_TVET = "free_tvet"
    PRIVATE = "private"
    REFERRAL = "referral"


class TicketRequestMixin:
    """Mixin class for common ticket/request management fields."""

    @declared_attr
    def status(cls):
        return Column(Enum(RequestStatus, create_constraint=False, values_callable=lambda x: [e.value for e in x]), default=RequestStatus.PENDING_PAYMENT, nullable=False, index=True)

    @declared_attr
    def priority(cls):
        return Column(Enum(TicketPriority, create_constraint=False, values_callable=lambda x: [e.value for e in x]), default=TicketPriority.MEDIUM, nullable=False, index=True)

    @declared_attr
    def service_type(cls):
        return Column(Enum(ServiceType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), default=ServiceType.STANDARD, nullable=False, index=True)

    @declared_attr
    def assigned_to_user_id(cls):
        return Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)

    @declared_attr
    def processed_by_user_id(cls):
        return Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)

    @declared_attr
    def dispatched_by_user_id(cls):
        return Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)

    @declared_attr
    def dispatched_at(cls):
        return Column(DateTime, nullable=True)

    @declared_attr
    def tracking_number(cls):
        return Column(String(100), nullable=True)

    @declared_attr
    def notes(cls):
        return Column(Text, nullable=True)

    @declared_attr
    def paid_at(cls):
        return Column(DateTime, nullable=True)

    @declared_attr
    def in_process_at(cls):
        return Column(DateTime, nullable=True)

    @declared_attr
    def ready_for_dispatch_at(cls):
        return Column(DateTime, nullable=True)

    @declared_attr
    def received_at(cls):
        return Column(DateTime, nullable=True)

    @declared_attr
    def completed_at(cls):
        return Column(DateTime, nullable=True)

    @declared_attr
    def created_at(cls):
        return Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    @declared_attr
    def updated_at(cls):
        return Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @declared_attr
    def assigned_to(cls):
        return relationship("PortalUser", foreign_keys=[cls.assigned_to_user_id])

    @declared_attr
    def processed_by(cls):
        return relationship("PortalUser", foreign_keys=[cls.processed_by_user_id])

    @declared_attr
    def dispatched_by(cls):
        return relationship("PortalUser", foreign_keys=[cls.dispatched_by_user_id])


class PortalUser(Base):
    __tablename__ = "portal_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(Role), nullable=False)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)

    school = relationship("School", back_populates="users")
    created_by = relationship("PortalUser", remote_side=[id], foreign_keys=[created_by_user_id])
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    registered_candidates = relationship("RegistrationCandidate", back_populates="portal_user")
    # user_permissions relationship will be defined after UserPermission class


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), nullable=False, index=True)  # Hashed refresh token
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("PortalUser", back_populates="refresh_tokens")


class School(Base):
    __tablename__ = "schools"

    id = Column(Integer, primary_key=True)
    code = Column(String(6), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_private_examination_center = Column(Boolean, default=False, nullable=False)
    # School profile fields
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    digital_address = Column(String(50), nullable=True)
    post_office_address = Column(String(255), nullable=True)
    is_private = Column(Boolean, nullable=True)  # True for private, False for public, None if not set
    principal_name = Column(String(255), nullable=True)
    principal_email = Column(String(255), nullable=True)
    principal_phone = Column(String(50), nullable=True)
    profile_completed = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    users = relationship("PortalUser", back_populates="school")
    candidates = relationship("RegistrationCandidate", back_populates="school")
    programmes = relationship("Programme", secondary="school_programmes", back_populates="schools")
    result_blocks = relationship("ResultBlock", back_populates="school", cascade="all, delete-orphan")


class RegistrationExam(Base):
    __tablename__ = "registration_exams"

    id = Column(Integer, primary_key=True)
    exam_id_main_system = Column(Integer, nullable=True, index=True)  # Reference to main system exam ID
    exam_type = Column(String(50), nullable=False)
    exam_series = Column(String(20), nullable=True)
    year = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    registration_period_id = Column(Integer, ForeignKey("exam_registration_periods.id", ondelete="CASCADE"), nullable=False, index=True)
    results_published = Column(Boolean, default=False, nullable=False, index=True)
    results_published_at = Column(DateTime, nullable=True)
    results_published_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    pricing_model_preference = Column(String(20), nullable=True)  # "per_subject", "tiered", or "per_programme" (must be explicit, no "auto")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    registration_period = relationship("ExamRegistrationPeriod", back_populates="exam")
    candidates = relationship("RegistrationCandidate", back_populates="exam")
    schedules = relationship("ExaminationSchedule", back_populates="exam", cascade="all, delete-orphan")
    exports = relationship("RegistrationExport", back_populates="exam")
    results = relationship("CandidateResult", back_populates="exam", cascade="all, delete-orphan")
    result_blocks = relationship("ResultBlock", back_populates="exam", cascade="all, delete-orphan")
    index_number_generation_jobs = relationship("IndexNumberGenerationJob", back_populates="exam", cascade="all, delete-orphan")
    results_published_by = relationship("PortalUser", foreign_keys=[results_published_by_user_id])


class ExamRegistrationPeriod(Base):
    __tablename__ = "exam_registration_periods"

    id = Column(Integer, primary_key=True)
    registration_start_date = Column(DateTime, nullable=False)
    registration_end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    allows_bulk_registration = Column(Boolean, default=True, nullable=False)
    allows_private_registration = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", back_populates="registration_period", uselist=False)


class RegistrationCandidate(Base):
    __tablename__ = "registration_candidates"

    id = Column(Integer, primary_key=True)
    registration_exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True)
    portal_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    firstname = Column(String(255), nullable=False)
    lastname = Column(String(255), nullable=False)
    othername = Column(String(255), nullable=True)
    registration_number = Column(String(50), unique=True, nullable=False, index=True)  # Unique number assigned during registration
    index_number = Column(String(50), nullable=True, index=True)  # NULL during registration, generated after registration period ends
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(20), nullable=True)
    programme_code = Column(String(50), nullable=True)  # Kept for backward compatibility
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="SET NULL"), nullable=True, index=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    address = Column(String(50), nullable=True)  # Ghana digital address format
    national_id = Column(String(50), nullable=True)
    disability = Column(Enum(Disability, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True)
    registration_type = Column(Enum(RegistrationType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True, index=True)
    guardian_name = Column(String(255), nullable=True)
    guardian_phone = Column(String(50), nullable=True)
    guardian_digital_address = Column(String(50), nullable=True)  # Ghana digital address format
    guardian_national_id = Column(String(50), nullable=True)
    registration_status = Column(Enum(RegistrationStatus), default=RegistrationStatus.PENDING, nullable=False, index=True)
    registration_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    total_paid_amount = Column(Numeric(10, 2), default=0, nullable=False)  # Track total amount paid across all payments
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @property
    def name(self) -> str:
        """Computed name property combining firstname, lastname, and othername."""
        parts = [self.firstname]
        if self.othername:
            parts.append(self.othername)
        parts.append(self.lastname)
        return " ".join(parts)

    @property
    def fullname(self) -> str:
        """Fullname property (same as name for backward compatibility)."""
        return self.name

    exam = relationship("RegistrationExam", back_populates="candidates")
    school = relationship("School", back_populates="candidates")
    portal_user = relationship("PortalUser", back_populates="registered_candidates")
    programme = relationship("Programme", back_populates="candidates")
    subject_selections = relationship("RegistrationSubjectSelection", back_populates="candidate", cascade="all, delete-orphan")
    photo = relationship("RegistrationCandidatePhoto", back_populates="candidate", uselist=False, cascade="all, delete-orphan")
    results = relationship("CandidateResult", back_populates="candidate", cascade="all, delete-orphan")
    result_blocks = relationship("ResultBlock", back_populates="candidate", cascade="all, delete-orphan")
    invoice = relationship("Invoice", uselist=False, back_populates="registration_candidate")
    payments = relationship("Payment", back_populates="registration_candidate")


class RegistrationSubjectSelection(Base):
    __tablename__ = "registration_subject_selections"

    id = Column(Integer, primary_key=True)
    registration_candidate_id = Column(Integer, ForeignKey("registration_candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=True, index=True)
    subject_code = Column(String(10), nullable=False)  # Kept for backward compatibility
    subject_name = Column(String(255), nullable=False)  # Kept for backward compatibility
    series = Column(Integer, nullable=True)  # For grouped subjects
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    candidate = relationship("RegistrationCandidate", back_populates="subject_selections")
    subject = relationship("Subject", back_populates="candidate_selections")


class ExaminationSchedule(Base):
    __tablename__ = "examination_schedules"

    id = Column(Integer, primary_key=True)
    registration_exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_code = Column(String(10), nullable=False)
    subject_name = Column(String(255), nullable=False)
    papers = Column(JSON, nullable=False, default=[{"paper": 1}])  # JSON array: [{"paper": 1, "date": "2026-01-15", "start_time": "09:00", "end_time": "11:00"}, {"paper": 2, "date": "2026-01-16", "start_time": "14:00", "end_time": "16:00"}] - date and start_time are required, end_time is optional
    venue = Column(String(255), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", back_populates="schedules")
    __table_args__ = (UniqueConstraint("registration_exam_id", "subject_code", name="uq_exam_subject_schedule"),)


class RegistrationExport(Base):
    __tablename__ = "registration_exports"

    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    exported_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    export_status = Column(Enum(ExportStatus), default=ExportStatus.PENDING, nullable=False, index=True)
    export_file_path = Column(String(512), nullable=True)
    export_format = Column(String(10), nullable=False)  # CSV, JSON, EXCEL
    total_registrations = Column(Integer, default=0, nullable=False)
    exported_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", back_populates="exports")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    original_code = Column(String(50), unique=True, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    subject_type = Column(Enum(SubjectType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Many-to-many relationship with Programme
    programmes = relationship("Programme", secondary="programme_subjects", back_populates="subjects")
    # One-to-many relationship with RegistrationSubjectSelection
    candidate_selections = relationship("RegistrationSubjectSelection", back_populates="subject")
    # One-to-many relationship with CandidateResult
    results = relationship("CandidateResult", back_populates="subject", cascade="all, delete-orphan")
    # One-to-many relationship with ResultBlock
    result_blocks = relationship("ResultBlock", back_populates="subject", cascade="all, delete-orphan")


class Programme(Base):
    __tablename__ = "programmes"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Many-to-many relationship with Subject
    subjects = relationship("Subject", secondary="programme_subjects", back_populates="programmes")
    # Many-to-many relationship with School
    schools = relationship("School", secondary="school_programmes", back_populates="programmes")
    # One-to-many relationship with RegistrationCandidate
    candidates = relationship("RegistrationCandidate", back_populates="programme")


# Association table for many-to-many relationship between Programme and Subject
programme_subjects = Table(
    "programme_subjects",
    Base.metadata,
    Column("programme_id", Integer, ForeignKey("programmes.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("is_compulsory", Boolean, nullable=True, comment="True for compulsory core subjects, False for optional core subjects, NULL for electives"),
    Column("choice_group_id", Integer, nullable=True, index=True, comment="Groups optional core subjects together. Subjects in the same group require selecting exactly one"),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint("programme_id", "subject_id", name="uq_programme_subject"),
)


# Association table for many-to-many relationship between School and Programme
school_programmes = Table(
    "school_programmes",
    Base.metadata,
    Column("school_id", Integer, ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True),
    Column("programme_id", Integer, ForeignKey("programmes.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint("school_id", "programme_id", name="uq_school_programme"),
)


class RegistrationCandidatePhoto(Base):
    """Model for candidate passport photographs."""

    __tablename__ = "registration_candidate_photos"

    id = Column(Integer, primary_key=True)
    registration_candidate_id = Column(Integer, ForeignKey("registration_candidates.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    file_path = Column(String(512), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    checksum = Column(String(64), nullable=False, index=True)  # SHA256
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    candidate = relationship("RegistrationCandidate", back_populates="photo")


class CandidateResult(Base):
    """Model for candidate examination results."""

    __tablename__ = "candidate_results"

    id = Column(Integer, primary_key=True)
    registration_candidate_id = Column(Integer, ForeignKey("registration_candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    registration_exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    grade = Column(Enum(Grade), nullable=False)
    is_published = Column(Boolean, default=False, nullable=False)
    published_at = Column(DateTime, nullable=True)
    published_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    candidate = relationship("RegistrationCandidate", back_populates="results")
    subject = relationship("Subject", back_populates="results")
    exam = relationship("RegistrationExam", back_populates="results")
    published_by = relationship("PortalUser", foreign_keys=[published_by_user_id])

    __table_args__ = (
        UniqueConstraint("registration_candidate_id", "subject_id", "registration_exam_id", name="uq_candidate_subject_exam_result"),
    )


class ResultBlock(Base):
    """Model for administratively blocking results."""

    __tablename__ = "result_blocks"

    id = Column(Integer, primary_key=True)
    block_type = Column(Enum(ResultBlockType), nullable=False, index=True)
    registration_exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    registration_candidate_id = Column(Integer, ForeignKey("registration_candidates.id", ondelete="CASCADE"), nullable=True, index=True)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    blocked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=False, index=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", back_populates="result_blocks")
    candidate = relationship("RegistrationCandidate", back_populates="result_blocks")
    school = relationship("School", back_populates="result_blocks")
    subject = relationship("Subject", back_populates="result_blocks")
    blocked_by = relationship("PortalUser", foreign_keys=[blocked_by_user_id])


class IndexNumberGenerationJob(Base):
    """Model for tracking index number generation jobs."""

    __tablename__ = "index_number_generation_jobs"

    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(Enum(IndexNumberGenerationJobStatus), default=IndexNumberGenerationJobStatus.PENDING, nullable=False, index=True)
    replace_existing = Column(Boolean, default=False, nullable=False)
    progress_current = Column(Integer, default=0, nullable=False)  # Number of candidates processed
    progress_total = Column(Integer, default=0, nullable=False)  # Total number of candidates to process
    current_school_id = Column(Integer, ForeignKey("schools.id", ondelete="SET NULL"), nullable=True)
    current_school_name = Column(String(255), nullable=True)
    school_progress = Column(JSON, nullable=True)  # JSON: [{school_id, school_code, school_name, processed, total, status}]
    error_message = Column(Text, nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    exam = relationship("RegistrationExam", back_populates="index_number_generation_jobs")
    current_school = relationship("School", foreign_keys=[current_school_id])
    created_by = relationship("PortalUser", foreign_keys=[created_by_user_id])


class SubjectPricing(Base):
    """Model for per-subject pricing configuration."""

    __tablename__ = "subject_pricing"

    id = Column(Integer, primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=True, index=True)  # NULL = global pricing
    registration_type = Column(Enum(RegistrationType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True, index=True)  # NULL = applies to all types
    price = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="GHS", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    subject = relationship("Subject")
    exam = relationship("RegistrationExam", foreign_keys=[exam_id])

    __table_args__ = (
        UniqueConstraint("subject_id", "exam_id", "registration_type", name="uq_subject_pricing"),
    )


class RegistrationTieredPricing(Base):
    """Model for tiered pricing based on number of subjects."""

    __tablename__ = "registration_tiered_pricing"

    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=True, index=True)  # NULL = global pricing
    registration_type = Column(Enum(RegistrationType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True, index=True)  # NULL = applies to all types
    min_subjects = Column(Integer, nullable=False)
    max_subjects = Column(Integer, nullable=True)  # NULL = unlimited
    price = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="GHS", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", foreign_keys=[exam_id])

    __table_args__ = (
        UniqueConstraint("exam_id", "registration_type", "min_subjects", "max_subjects", name="uq_tiered_pricing"),
    )


class RegistrationApplicationFee(Base):
    """Model for application fee pricing configuration."""

    __tablename__ = "registration_application_fees"

    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=True, index=True)  # NULL = global application fee
    registration_type = Column(Enum(RegistrationType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True, index=True)  # NULL = applies to all types
    fee = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="GHS", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", foreign_keys=[exam_id])

    __table_args__ = (
        UniqueConstraint("exam_id", "registration_type", name="uq_application_fee"),
    )


class ExamPricingModel(Base):
    """Model for pricing model preference per registration type."""

    __tablename__ = "exam_pricing_models"

    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=True, index=True)  # NULL = global pricing model
    registration_type = Column(Enum(RegistrationType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True, index=True)  # NULL = applies to all types
    pricing_model_preference = Column(String(20), nullable=False)  # "per_subject", "tiered", or "per_programme" (must be explicit, no "auto")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", foreign_keys=[exam_id])

    __table_args__ = (
        UniqueConstraint("exam_id", "registration_type", name="uq_exam_pricing_model"),
    )


class ProgrammePricing(Base):
    """Model for per-programme pricing configuration."""

    __tablename__ = "programme_pricing"

    id = Column(Integer, primary_key=True)
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("registration_exams.id", ondelete="CASCADE"), nullable=True, index=True)  # NULL = global pricing
    registration_type = Column(Enum(RegistrationType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True, index=True)  # NULL = applies to all types
    price = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), default="GHS", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    programme = relationship("Programme")
    exam = relationship("RegistrationExam", foreign_keys=[exam_id])

    __table_args__ = (
        UniqueConstraint("programme_id", "exam_id", "registration_type", name="uq_programme_pricing"),
    )


class Invoice(Base):
    """Model for invoices generated for certificate requests, confirmation requests, and registration candidates."""

    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    invoice_number = Column(String(50), unique=True, nullable=False, index=True)  # Format: INV-YYYYMMDD-XXXXXX
    certificate_request_id = Column(Integer, ForeignKey("certificate_requests.id", ondelete="CASCADE"), nullable=True, unique=True, index=True)  # For Certificate/Attestation requests
    certificate_confirmation_request_id = Column(Integer, ForeignKey("certificate_confirmation_requests.id", ondelete="CASCADE"), nullable=True, unique=True, index=True)  # For confirmation requests
    registration_candidate_id = Column(Integer, ForeignKey("registration_candidates.id", ondelete="SET NULL"), nullable=True, index=True)  # For registration candidates
    amount = Column(Numeric(10, 2), nullable=False)  # Invoice amount
    currency = Column(String(3), default="GHS", nullable=False)  # Currency code
    status = Column(String(20), default="pending", nullable=False, index=True)  # "pending", "paid", "cancelled"
    due_date = Column(Date, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    certificate_request = relationship("CertificateRequest", foreign_keys=[certificate_request_id], uselist=False)
    certificate_confirmation_request = relationship("CertificateConfirmationRequest", foreign_keys=[certificate_confirmation_request_id], uselist=False)
    registration_candidate = relationship("RegistrationCandidate", foreign_keys=[registration_candidate_id])


class CertificateRequest(TicketRequestMixin, Base):
    """Model for certificate and attestation requests."""

    __tablename__ = "certificate_requests"

    id = Column(Integer, primary_key=True)
    request_type = Column(Enum(CertificateRequestType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    request_number = Column(String(50), unique=True, nullable=False, index=True)  # Format: REQ-YYYYMMDD-XXXXXX
    index_number = Column(String(50), nullable=False, index=True)  # Candidate's examination index number
    exam_year = Column(Integer, nullable=False, index=True)  # Year of examination
    examination_series = Column(Enum(ExamSeries, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)  # Examination series (MAY/JUNE or NOV/DEC)
    examination_center_id = Column(Integer, ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True)  # Nullable for confirmation/verification
    national_id_number = Column(String(50), nullable=True, index=True)  # Nullable for confirmation/verification
    national_id_file_path = Column(String(512), nullable=True)  # Path to uploaded ID scan (optional for confirmation/verification)
    photograph_file_path = Column(String(512), nullable=True)  # Path to uploaded photograph (optional for confirmation/verification)
    delivery_method = Column(Enum(DeliveryMethod, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=True)  # Nullable for confirmation/verification
    # Confirmation/Verification specific fields
    candidate_name = Column(String(255), nullable=True)  # Name of candidate whose certificate is being verified
    candidate_index_number = Column(String(50), nullable=True, index=True)  # Candidate's index number (alternative to index_number for clarity)
    school_name = Column(String(255), nullable=True)  # Free text school name
    programme_name = Column(String(255), nullable=True)  # Free text programme name
    completion_year = Column(Integer, nullable=True, index=True)  # Year the candidate completed/graduated from school
    certificate_file_path = Column(String(512), nullable=True)  # Path to uploaded certificate scan
    candidate_photograph_file_path = Column(String(512), nullable=True)  # Path to uploaded candidate photograph
    request_details = Column(Text, nullable=True)  # Optional text detailing the request
    contact_phone = Column(String(50), nullable=False)  # Required for courier
    contact_email = Column(String(255), nullable=True)  # Optional
    courier_address_line1 = Column(String(255), nullable=True)  # For courier delivery
    courier_address_line2 = Column(String(255), nullable=True)
    courier_city = Column(String(100), nullable=True)
    courier_region = Column(String(100), nullable=True)
    courier_postal_code = Column(String(20), nullable=True)
    # invoice_id removed - Invoice.certificate_request_id is the owning side of the one-to-one relationship
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)

    examination_center = relationship("School", foreign_keys=[examination_center_id])
    # invoice relationship removed - use Invoice.certificate_request back-reference instead
    # payment relationship removed - use Payment.certificate_request back-reference instead




class Payment(Base):
    """Model for payments processed through Paystack."""

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    certificate_request_id = Column(Integer, ForeignKey("certificate_requests.id", ondelete="CASCADE"), nullable=True, index=True)  # For Certificate/Attestation requests
    certificate_confirmation_request_id = Column(Integer, ForeignKey("certificate_confirmation_requests.id", ondelete="CASCADE"), nullable=True, index=True)  # For confirmation requests
    registration_candidate_id = Column(Integer, ForeignKey("registration_candidates.id", ondelete="SET NULL"), nullable=True, index=True)  # For registration candidates
    paystack_reference = Column(String(100), unique=True, nullable=True, index=True)  # Paystack transaction reference
    paystack_authorization_url = Column(String(512), nullable=True)  # Payment URL
    amount = Column(Numeric(10, 2), nullable=False)  # Payment amount
    currency = Column(String(3), default="GHS", nullable=False)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False, index=True)
    paystack_response = Column(JSON, nullable=True)  # Full Paystack response for tracking
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    invoice = relationship("Invoice", foreign_keys=[invoice_id])
    certificate_request = relationship("CertificateRequest", foreign_keys=[certificate_request_id])
    certificate_confirmation_request = relationship("CertificateConfirmationRequest", foreign_keys=[certificate_confirmation_request_id])
    registration_candidate = relationship("RegistrationCandidate", foreign_keys=[registration_candidate_id])


class TicketActivity(Base):
    """Model for ticket activity/comment history."""

    __tablename__ = "ticket_activities"

    id = Column(Integer, primary_key=True)
    ticket_type = Column(String(50), nullable=False, index=True)  # "certificate_request" or "certificate_confirmation_request"
    ticket_id = Column(Integer, nullable=False, index=True)  # ID of the ticket (no foreign key for polymorphism)
    activity_type = Column(Enum(TicketActivityType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    old_assigned_to = Column(UUID(as_uuid=True), nullable=True)
    new_assigned_to = Column(UUID(as_uuid=True), nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("PortalUser", foreign_keys=[user_id])


class TicketStatusHistory(Base):
    """Model for ticket status transition audit trail."""

    __tablename__ = "ticket_status_history"

    id = Column(Integer, primary_key=True)
    ticket_type = Column(String(50), nullable=False, index=True)  # "certificate_request" or "certificate_confirmation_request"
    ticket_id = Column(Integer, nullable=False, index=True)  # ID of the ticket (no foreign key for polymorphism)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    changed_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    changed_by = relationship("PortalUser", foreign_keys=[changed_by_user_id])


class CertificateConfirmationRequest(TicketRequestMixin, Base):
    """Model for certificate confirmation requests. Single entry in certificate_details = single request, multiple entries = bulk request."""

    __tablename__ = "certificate_confirmation_requests"

    id = Column(Integer, primary_key=True)
    request_number = Column(String(50), unique=True, nullable=False, index=True)  # Format: REQ-YYYYMMDD-XXXXXX or BULK-YYYYMMDD-XXXXXX
    request_type = Column(Enum(CertificateRequestType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)  # CONFIRMATION or VERIFICATION
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)  # Logged-in user who created this request
    contact_phone = Column(String(50), nullable=False)  # Requester's contact phone (may differ from user's account email)
    contact_email = Column(String(255), nullable=True)  # Requester's contact email (may differ from user's account email)
    certificate_details = Column(JSON, nullable=False)  # Array of certificate details. Single entry = single request, multiple = bulk
    # Example structure: [{"candidate_name": "...", "candidate_index_number": "...", "school_name": "...", "programme_name": "...", "completion_year": 2020, "certificate_file_path": "...", "candidate_photograph_file_path": "...", "request_details": "..."}]
    pdf_file_path = Column(String(512), nullable=True)  # Path to generated/uploaded PDF (the certificate confirmation document)
    pdf_generated_at = Column(DateTime, nullable=True)
    pdf_generated_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)  # User who generated/uploaded PDF
    # Response (admin-generated or uploaded) that the requester can view/download
    response_file_path = Column(String(512), nullable=True)  # Path to stored response file (PDF or other)
    response_file_name = Column(String(255), nullable=True)  # Original filename (or generated)
    response_mime_type = Column(String(100), nullable=True)  # Content-Type for streaming
    response_source = Column(String(20), nullable=True)  # "upload" | "template"
    response_reference_number = Column(String(50), nullable=True, index=True)  # Reference number for the response letter (may differ from request_number, can come from external system)
    responded_at = Column(DateTime, nullable=True)
    responded_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    response_notes = Column(Text, nullable=True)
    response_payload = Column(JSON, nullable=True)  # Optional: inputs used to generate template response
    # Signing fields
    response_signed = Column(Boolean, default=False, nullable=False, index=True)
    response_signed_at = Column(DateTime, nullable=True)
    response_signed_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    # Revocation fields
    response_revoked = Column(Boolean, default=False, nullable=False, index=True)
    response_revoked_at = Column(DateTime, nullable=True)
    response_revoked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    response_revocation_reason = Column(Text, nullable=True)  # Reason/note for revocation
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)

    invoice = relationship("Invoice", foreign_keys=[invoice_id], uselist=False)
    payment = relationship("Payment", foreign_keys=[payment_id], uselist=False)
    user = relationship("PortalUser", foreign_keys=[user_id])
    pdf_generated_by = relationship("PortalUser", foreign_keys=[pdf_generated_by_user_id])
    responded_by = relationship("PortalUser", foreign_keys=[responded_by_user_id])
    response_signed_by = relationship("PortalUser", foreign_keys=[response_signed_by_user_id])
    response_revoked_by = relationship("PortalUser", foreign_keys=[response_revoked_by_user_id])


class RolePermission(Base):
    """Model for role-level permission overrides."""

    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True)
    role = Column(Enum(Role), nullable=False, index=True)
    permission_key = Column(String(255), nullable=False, index=True)
    granted = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)

    created_by = relationship("PortalUser", foreign_keys=[created_by_user_id])

    __table_args__ = (
        UniqueConstraint("role", "permission_key", name="uq_role_permission"),
    )


class UserPermission(Base):
    """Model for user-level permission overrides."""

    __tablename__ = "user_permissions"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_key = Column(String(255), nullable=False, index=True)
    granted = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    expires_at = Column(DateTime, nullable=True, index=True)  # Optional expiration for temporary permissions

    user = relationship("PortalUser", foreign_keys=[user_id], back_populates="user_permissions")
    created_by = relationship("PortalUser", foreign_keys=[created_by_user_id])

    __table_args__ = (
        UniqueConstraint("user_id", "permission_key", name="uq_user_permission"),
    )


class UserCredit(Base):
    """Model for user credit balance management."""

    __tablename__ = "user_credits"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    balance = Column(Numeric(10, 2), default=0, nullable=False)
    total_purchased = Column(Numeric(10, 2), default=0, nullable=False)
    total_used = Column(Numeric(10, 2), default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("PortalUser", back_populates="credit_account")
    transactions = relationship("CreditTransaction", back_populates="user_credit", cascade="all, delete-orphan")


class CreditTransaction(Base):
    """Model for credit transaction history."""

    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="CASCADE"), nullable=False, index=True)
    user_credit_id = Column(Integer, ForeignKey("user_credits.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_type = Column(Enum(CreditTransactionType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)  # Positive for additions, negative for usage
    balance_after = Column(Numeric(10, 2), nullable=False)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_by_user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="SET NULL"), nullable=True, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("PortalUser", foreign_keys=[user_id])
    user_credit = relationship("UserCredit", back_populates="transactions")
    payment = relationship("Payment", foreign_keys=[payment_id])
    assigned_by = relationship("PortalUser", foreign_keys=[assigned_by_user_id])


class ApiKey(Base):
    """Model for API key management."""

    __tablename__ = "api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="CASCADE"), nullable=False, index=True)
    key_hash = Column(String(255), nullable=False, index=True)
    key_prefix = Column(String(20), nullable=False)  # First 8 characters for display
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    last_used_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    rate_limit_per_minute = Column(Integer, default=60, nullable=False)
    request_count = Column(Integer, default=0, nullable=False)
    request_count_reset_at = Column(DateTime, nullable=True)
    total_requests = Column(Integer, default=0, nullable=False)
    total_verifications = Column(Integer, default=0, nullable=False)

    user = relationship("PortalUser", back_populates="api_keys")
    usage_records = relationship("ApiUsage", back_populates="api_key", cascade="all, delete-orphan")


class ApiUsage(Base):
    """Model for API usage tracking and billing."""

    __tablename__ = "api_usage"

    id = Column(Integer, primary_key=True)
    api_key_id = Column(UUID(as_uuid=True), ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("portal_users.id", ondelete="CASCADE"), nullable=False, index=True)
    request_source = Column(Enum(ApiRequestSource, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    request_type = Column(Enum(ApiRequestType, create_constraint=False, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    verification_count = Column(Integer, default=0, nullable=False)
    request_timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    response_status = Column(Integer, nullable=False)
    duration_ms = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    api_key = relationship("ApiKey", back_populates="usage_records")
    user = relationship("PortalUser", foreign_keys=[user_id])


# Define the relationship after both classes are defined to avoid forward reference issues
PortalUser.user_permissions = relationship(
    UserPermission,
    foreign_keys=[UserPermission.user_id],
    back_populates="user",
    cascade="all, delete-orphan"
)

# Add relationships to PortalUser for new models
PortalUser.credit_account = relationship("UserCredit", back_populates="user", uselist=False, cascade="all, delete-orphan")
PortalUser.api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
