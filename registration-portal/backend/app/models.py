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
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.dependencies.database import Base


class PortalUserType(enum.Enum):
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    SCHOOL_ADMIN = "SCHOOL_ADMIN"
    SCHOOL_USER = "SCHOOL_USER"
    PRIVATE_USER = "PRIVATE_USER"


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
    CERTIFICATE_II = "Certificate II Examination"
    CBT = "CBT"


class ExamSeries(enum.Enum):
    MAY_JUNE = "MAY/JUNE"
    NOV_DEC = "NOV/DEC"


class PortalUser(Base):
    __tablename__ = "portal_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    user_type = Column(Enum(PortalUserType), nullable=False)
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    users = relationship("PortalUser", back_populates="school")
    candidates = relationship("RegistrationCandidate", back_populates="school")
    programmes = relationship("Programme", secondary="school_programmes", back_populates="schools")


class RegistrationExam(Base):
    __tablename__ = "registration_exams"

    id = Column(Integer, primary_key=True)
    exam_id_main_system = Column(Integer, nullable=True, index=True)  # Reference to main system exam ID
    exam_type = Column(String(50), nullable=False)
    exam_series = Column(String(20), nullable=False)
    year = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    registration_period_id = Column(Integer, ForeignKey("exam_registration_periods.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    registration_period = relationship("ExamRegistrationPeriod", back_populates="exam")
    candidates = relationship("RegistrationCandidate", back_populates="exam")
    schedules = relationship("ExaminationSchedule", back_populates="exam", cascade="all, delete-orphan")
    exports = relationship("RegistrationExport", back_populates="exam")


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
    name = Column(String(255), nullable=False)
    registration_number = Column(String(50), unique=True, nullable=False, index=True)  # Unique number assigned during registration
    index_number = Column(String(50), nullable=True, index=True)  # NULL during registration, generated after registration period ends
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(20), nullable=True)
    programme_code = Column(String(50), nullable=True)  # Kept for backward compatibility
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="SET NULL"), nullable=True, index=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    national_id = Column(String(50), nullable=True)
    registration_status = Column(Enum(RegistrationStatus), default=RegistrationStatus.PENDING, nullable=False, index=True)
    registration_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("RegistrationExam", back_populates="candidates")
    school = relationship("School", back_populates="candidates")
    portal_user = relationship("PortalUser", back_populates="registered_candidates")
    programme = relationship("Programme", back_populates="candidates")
    subject_selections = relationship("RegistrationSubjectSelection", back_populates="candidate", cascade="all, delete-orphan")
    photo = relationship("RegistrationCandidatePhoto", back_populates="candidate", uselist=False, cascade="all, delete-orphan")


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
    examination_date = Column(Date, nullable=False)
    examination_time = Column(Time, nullable=False)
    examination_end_time = Column(Time, nullable=True)
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
