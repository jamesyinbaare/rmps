from datetime import datetime
import enum

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
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.dependencies.database import Base


class SchoolRegion(enum.Enum):
    ASHANTI = "Ashanti Region"
    BONO = "Bono Region"
    BONO_EAST = "Bono East Region"
    AHAFO = "Ahafo Region"
    CENTRAL = "Central Region"
    EASTERN = "Eastern Region"
    GREATER_ACCRA = "Greater Accra Region"
    NORTHERN = "Northern Region"
    NORTH_EAST = "North East Region"
    SAVANNAH = "Savannah Region"
    UPPER_EAST = "Upper East Region"
    UPPER_WEST = "Upper West Region"
    VOLTA = "Volta Region"
    OTI = "Oti Region"
    WESTERN = "Western Region"
    WESTERN_NORTH = "Western North Region"


class SchoolZone(enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    F = "F"
    G = "G"
    H = "H"
    I = "I"
    J = "J"
    K = "K"
    L = "L"
    M = "M"
    N = "N"
    O = "O"
    P = "P"
    Q = "Q"
    R = "R"
    S = "S"
    T = "T"
    U = "U"
    V = "V"
    W = "W"
    X = "X"
    Y = "Y"
    Z = "Z"


class SchoolType(enum.Enum):
    PRIVATE = "private"
    PUBLIC = "public"


class ExamName(enum.Enum):
    CERTIFICATE_II = "Certificate II Examination"
    CBT = "CBT"


class ExamSeries(enum.Enum):
    MAY_JUNE = "MAY/JUNE"
    NOV_DEC = "NOV/DEC"


class SubjectType(enum.Enum):
    CORE = "CORE"
    ELECTIVE = "ELECTIVE"


class School(Base):
    __tablename__ = "schools"
    id = Column(Integer, primary_key=True)
    code = Column(String(6), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    region = Column(Enum(SchoolRegion), nullable=False)
    zone = Column(Enum(SchoolZone), nullable=False)
    school_type = Column(Enum(SchoolType), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Many-to-many relationship with Programme
    programmes = relationship("Programme", secondary="school_programmes", back_populates="schools")
    documents = relationship("Document", back_populates="school")
    candidates = relationship("Candidate", back_populates="school")


class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True)
    code = Column(String(3), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    subject_type = Column(Enum(SubjectType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Many-to-many relationship with Programme
    programmes = relationship("Programme", secondary="programme_subjects", back_populates="subjects")
    documents = relationship("Document", back_populates="subject")
    exam_subjects = relationship("ExamSubject", back_populates="subject")


# Association table for many-to-many relationship between Programme and Subject
programme_subjects = Table(
    "programme_subjects",
    Base.metadata,
    Column("programme_id", Integer, ForeignKey("programmes.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
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


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    file_path = Column(String(512), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    checksum = Column(String(64), nullable=False, index=True)  # SHA256
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="RESTRICT"), nullable=False, index=True)
    test_type = Column(String(1), nullable=True)  # 1 = Objectives Test, 2 = Essay
    subject_series = Column(String(1), nullable=True)
    sheet_number = Column(String(2), nullable=True)
    extracted_id = Column(String(13), nullable=True, index=True)
    extraction_method = Column(String(20), nullable=True)  # barcode, ocr, manual
    extraction_confidence = Column(Float, nullable=True)  # 0.0 to 1.0
    status = Column(String(20), default="pending", nullable=False)  # pending, processed, error

    school = relationship("School", back_populates="documents")
    subject = relationship("Subject", back_populates="documents")
    exam = relationship("Exam", back_populates="documents")
    batch_documents = relationship("BatchDocument", back_populates="document")


class Batch(Base):
    __tablename__ = "batches"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    status = Column(String(20), default="pending", nullable=False, index=True)  # pending, processing, completed, failed
    total_files = Column(Integer, default=0, nullable=False)
    processed_files = Column(Integer, default=0, nullable=False)
    failed_files = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    batch_documents = relationship("BatchDocument", back_populates="batch", cascade="all, delete-orphan")


class BatchDocument(Base):
    __tablename__ = "batch_documents"
    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("batches.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    processing_status = Column(String(20), default="pending", nullable=False)  # pending, processing, completed, failed
    error_message = Column(Text, nullable=True)

    batch = relationship("Batch", back_populates="batch_documents")
    document = relationship("Document", back_populates="batch_documents")


class Programme(Base):
    __tablename__ = "programmes"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Many-to-many relationship with Subject
    subjects = relationship("Subject", secondary="programme_subjects", back_populates="programmes")
    # Many-to-many relationship with School
    schools = relationship("School", secondary="school_programmes", back_populates="programmes")
    # One-to-many relationship with Candidate
    candidates = relationship("Candidate", back_populates="programme")


class Candidate(Base):
    __tablename__ = "candidates"
    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    index_number = Column(String(50), nullable=False, index=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    school = relationship("School", back_populates="candidates")
    programme = relationship("Programme", back_populates="candidates")
    exam_registrations = relationship("ExamRegistration", back_populates="candidate", cascade="all, delete-orphan")


class Exam(Base):
    __tablename__ = "exams"
    id = Column(Integer, primary_key=True)
    name = Column(Enum(ExamName), nullable=False)
    description = Column(Text, nullable=True)
    year = Column(Integer, nullable=False)
    series = Column(Enum(ExamSeries), nullable=False)
    number_of_series = Column(Integer, nullable=False, default=1)  # Number of groups (1-8, 1-4, etc.)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam_subjects = relationship("ExamSubject", back_populates="exam", cascade="all, delete-orphan")
    exam_registrations = relationship("ExamRegistration", back_populates="exam", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="exam")
    __table_args__ = (UniqueConstraint("name", "series", "year", name="uq_exam_name_series_year"),)


class ExamSubject(Base):
    __tablename__ = "exam_subjects"
    id = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    obj_pct = Column(Float, nullable=True)
    essay_pct = Column(Float, nullable=True)
    pract_pct = Column(Float, nullable=True)
    obj_max_score = Column(Float, nullable=True)
    essay_max_score = Column(Float, nullable=True)
    pract_max_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam = relationship("Exam", back_populates="exam_subjects")
    subject = relationship("Subject", back_populates="exam_subjects")
    subject_registrations = relationship("SubjectRegistration", back_populates="exam_subject", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("exam_id", "subject_id", name="uq_exam_subject"),)


class ExamRegistration(Base):
    __tablename__ = "exam_registrations"
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    index_number = Column(String(50), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    candidate = relationship("Candidate", back_populates="exam_registrations")
    exam = relationship("Exam", back_populates="exam_registrations")
    subject_registrations = relationship(
        "SubjectRegistration", back_populates="exam_registration", cascade="all, delete-orphan"
    )
    __table_args__ = (
        UniqueConstraint("candidate_id", "exam_id", name="uq_candidate_exam"),
        UniqueConstraint("index_number", "exam_id", name="uq_index_number_exam"),
    )


class SubjectRegistration(Base):
    __tablename__ = "subject_registrations"
    id = Column(Integer, primary_key=True)
    exam_registration_id = Column(
        Integer, ForeignKey("exam_registrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exam_subject_id = Column(Integer, ForeignKey("exam_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    series = Column(Integer, nullable=True)  # Group number (1 to exam.subject_series, or null)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam_registration = relationship("ExamRegistration", back_populates="subject_registrations")
    exam_subject = relationship("ExamSubject", back_populates="subject_registrations")
    subject_score = relationship(
        "SubjectScore", back_populates="subject_registration", uselist=False, cascade="all, delete-orphan"
    )
    __table_args__ = (UniqueConstraint("exam_registration_id", "exam_subject_id", name="uq_exam_registration_exam_subject"),)


class SubjectScore(Base):
    __tablename__ = "subject_scores"
    id = Column(Integer, primary_key=True)
    subject_registration_id = Column(
        Integer, ForeignKey("subject_registrations.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    obj_raw_score = Column(Float, nullable=True)
    essay_raw_score = Column(Float, nullable=False)
    pract_raw_score = Column(Float, nullable=True)
    obj_normalized = Column(Float, nullable=True)
    essay_normalized = Column(Float, nullable=True)
    pract_normalized = Column(Float, nullable=True)
    total_score = Column(Float, nullable=False)
    document_id = Column(String(13), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    subject_registration = relationship("SubjectRegistration", back_populates="subject_score")
