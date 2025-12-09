from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
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


class School(Base):
    __tablename__ = "schools"
    id = Column(Integer, primary_key=True)
    code = Column(String(6), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Many-to-many relationship with Subject
    subjects = relationship("Subject", secondary="school_subjects", back_populates="schools")
    documents = relationship("Document", back_populates="school")


class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True)
    code = Column(String(4), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Many-to-many relationship with School
    schools = relationship("School", secondary="school_subjects", back_populates="subjects")
    documents = relationship("Document", back_populates="subject")


# Association table for many-to-many relationship between School and Subject
school_subjects = Table(
    "school_subjects",
    Base.metadata,
    Column("school_id", Integer, ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint("school_id", "subject_id", name="uq_school_subject"),
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
    test_type = Column(String(1), nullable=True)  # 1 = Objectives Test, 2 = Essay
    sheet_number = Column(String(2), nullable=True)
    extracted_id = Column(String(13), nullable=True, index=True)
    extraction_method = Column(String(20), nullable=True)  # barcode, ocr, manual
    extraction_confidence = Column(Float, nullable=True)  # 0.0 to 1.0
    status = Column(String(20), default="pending", nullable=False)  # pending, processed, error

    school = relationship("School", back_populates="documents")
    subject = relationship("Subject", back_populates="documents")
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
