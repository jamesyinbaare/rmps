import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.dependencies.database import Base


class Region(enum.Enum):
    ASHANTI = "Ashanti"
    BONO = "Bono"
    BONO_EAST = "Bono East"
    AHAFO = "Ahafo"
    CENTRAL = "Central"
    EASTERN = "Eastern"
    GREATER_ACCRA = "Greater Accra"
    NORTHERN = "Northern"
    NORTH_EAST = "North East"
    SAVANNAH = "Savannah"
    UPPER_EAST = "Upper East"
    UPPER_WEST = "Upper West"
    VOLTA = "Volta"
    OTI = "Oti"
    WESTERN = "Western"
    WESTERN_NORTH = "Western North"


class Zone(enum.Enum):
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


class SubjectType(enum.Enum):
    CORE = "CORE"
    ELECTIVE = "ELECTIVE"


class UserRole(enum.IntEnum):
    """User roles for exam-tools. Lower values have higher privileges."""

    SUPER_ADMIN = 0
    SUPERVISOR = 10
    INSPECTOR = 20

    def __lt__(self, other: "UserRole") -> bool:
        return self.value < other.value

    def __le__(self, other: "UserRole") -> bool:
        return self.value <= other.value

    def __gt__(self, other: "UserRole") -> bool:
        return self.value > other.value

    def __ge__(self, other: "UserRole") -> bool:
        return self.value >= other.value


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=True, index=True)
    school_code = Column(String(10), nullable=True, index=True)
    phone_number = Column(String(50), nullable=True, index=True)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, create_constraint=False), nullable=False, default=UserRole.SUPERVISOR)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)

    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


class School(Base):
    __tablename__ = "schools"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(6), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    region = Column(Enum(Region), nullable=False)
    zone = Column(Enum(Zone), nullable=False)
    school_type = Column(Enum(SchoolType), nullable=True)
    is_private_examination_center = Column(Boolean, default=False, nullable=False)
    writes_at_center_id = Column(
        UUID(as_uuid=True),
        ForeignKey("schools.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    writes_at_center = relationship(
        "School",
        remote_side=[id],
        foreign_keys=[writes_at_center_id],
        back_populates="hosted_schools",
    )
    hosted_schools = relationship(
        "School",
        back_populates="writes_at_center",
        foreign_keys=[writes_at_center_id],
    )
    programmes = relationship("Programme", secondary="school_programmes", back_populates="schools")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    original_code = Column(String(50), unique=True, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    subject_type = Column(Enum(SubjectType), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    programmes = relationship("Programme", secondary="programme_subjects", back_populates="subjects")


class Programme(Base):
    __tablename__ = "programmes"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    subjects = relationship("Subject", secondary="programme_subjects", back_populates="programmes")
    schools = relationship("School", secondary="school_programmes", back_populates="programmes")


programme_subjects = Table(
    "programme_subjects",
    Base.metadata,
    Column("programme_id", Integer, ForeignKey("programmes.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "is_compulsory",
        Boolean,
        nullable=True,
    ),
    Column("choice_group_id", Integer, nullable=True, index=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint("programme_id", "subject_id", name="uq_programme_subject"),
)


school_programmes = Table(
    "school_programmes",
    Base.metadata,
    Column("school_id", UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True),
    Column("programme_id", Integer, ForeignKey("programmes.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow, nullable=False),
    UniqueConstraint("school_id", "programme_id", name="uq_school_programme"),
)
