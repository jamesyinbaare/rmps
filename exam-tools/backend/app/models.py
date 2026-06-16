import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
    text,
)
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


class ExaminerType(enum.Enum):
    CHIEF = "chief_examiner"
    ASSISTANT_CHIEF = "assistant_chief_examiner"
    ASSISTANT = "assistant_examiner"
    TEAM_LEADER = "team_leader"


def examiner_type_column(**kwargs):
    """Persist examiner roles as API strings (e.g. chief_examiner), not PG enum names."""
    return Column(
        Enum(
            ExaminerType,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        **kwargs,
    )


class ExaminerAllowanceType(enum.Enum):
    RESPONSIBILITY = "responsibility_allowance"
    INCONVENIENCE = "inconvenience_allowance"
    CHIEF_EXAMINERS_REPORT = "chief_examiners_report"
    VETTING_OF_SCRIPTS = "vetting_of_scripts"
    INTERNAL_COMMUTING = "internal_commuting"


class ExaminerInvitationStatus(enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    EXPIRED = "expired"
    QUOTA_WAITLISTED = "quota_waitlisted"


class ExaminerRosterSource(enum.Enum):
    MANUAL = "manual"
    INVITATION = "invitation"


class AllocationRunStatus(enum.Enum):
    DRAFT = "draft"
    OPTIMAL = "optimal"
    INFEASIBLE = "infeasible"
    TIMEOUT = "timeout"
    ERROR = "error"


class MarkingScriptSourceMode(enum.Enum):
    ALLOCATION = "allocation"
    MANUAL = "manual"


class UserRole(enum.IntEnum):
    """User roles for exam-tools. Lower values have higher privileges."""

    SUPER_ADMIN = 0
    TEST_ADMIN_OFFICER = 5
    FINANCE_OFFICER = 6
    EXECUTIVE_VIEWER = 7
    SUPERVISOR = 10
    INSPECTOR = 20
    SUBJECT_OFFICER = 25
    DEPOT_KEEPER = 30

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
    # Login handle for depot keepers (unique when set).
    username = Column(String(80), unique=True, nullable=True, index=True)
    school_code = Column(String(15), nullable=True, index=True)
    phone_number = Column(String(50), nullable=True, index=True)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, create_constraint=False), nullable=False, default=UserRole.SUPERVISOR)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)
    depot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("depots.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    uploaded_exam_documents = relationship("ExamDocument", back_populates="uploaded_by")
    depot = relationship("Depot", back_populates="users")
    subject_officer_assignments = relationship(
        "SubjectOfficerAssignment",
        foreign_keys="SubjectOfficerAssignment.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index(
            "ix_users_unique_phone_inspector",
            "phone_number",
            unique=True,
            postgresql_where=text("role = 'INSPECTOR' AND phone_number IS NOT NULL"),
        ),
        Index(
            "ix_users_unique_phone_subject_officer",
            "phone_number",
            unique=True,
            postgresql_where=text("role = 'SUBJECT_OFFICER' AND phone_number IS NOT NULL"),
        ),
    )


class SmsDelivery(Base):
    """Audit log for outbound SMS (inspector credentials, etc.)."""

    __tablename__ = "sms_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    examiner_invitation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examiner_invitations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    examiner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examiners.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    script_checker_id = Column(
        UUID(as_uuid=True),
        ForeignKey("script_checkers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    data_entry_clerk_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_entry_clerks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    phone_number = Column(String(50), nullable=False)
    msisdn = Column(String(20), nullable=False)
    message_type = Column(String(32), nullable=False)
    trigger = Column(String(32), nullable=False)
    status = Column(String(16), nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    provider = Column(String(16), nullable=False, default="nalo")
    provider_response = Column(Text, nullable=True)
    retried_from_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sms_deliveries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    triggered_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    sent_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    examiner_invitation = relationship("ExaminerInvitation", back_populates="sms_deliveries")
    examiner = relationship("Examiner", back_populates="sms_deliveries")
    script_checker = relationship("ScriptChecker", back_populates="sms_deliveries")
    data_entry_clerk = relationship("DataEntryClerk", back_populates="sms_deliveries")
    triggered_by = relationship("User", foreign_keys=[triggered_by_user_id])
    retried_from = relationship("SmsDelivery", remote_side=[id], foreign_keys=[retried_from_id])

    __table_args__ = (
        Index("ix_sms_deliveries_status_created_at", "status", "created_at"),
        CheckConstraint(
            "user_id IS NOT NULL OR examiner_invitation_id IS NOT NULL OR examiner_id IS NOT NULL "
            "OR script_checker_id IS NOT NULL OR data_entry_clerk_id IS NOT NULL",
            name="ck_sms_deliveries_recipient",
        ),
    )


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


class Depot(Base):
    """Physical depot grouping schools; depot keepers confirm script and question-paper control entries."""

    __tablename__ = "depots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    schools = relationship("School", back_populates="depot")
    users = relationship("User", back_populates="depot")


class School(Base):
    __tablename__ = "schools"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(15), unique=True, nullable=False, index=True)
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
    depot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("depots.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    depot = relationship("Depot", back_populates="schools")
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


class CentreStructureMode(enum.Enum):
    """How schools are assigned to examination centres for an examination."""

    UNIFIED = "UNIFIED"
    SPLIT = "SPLIT"


class ExaminationCentreMembershipScope(enum.Enum):
    """Subject scope for a school's membership in an examination centre."""

    ALL = "ALL"
    CORE = "CORE"
    ELECTIVE = "ELECTIVE"


class Examination(Base):
    """Certificate examination instance (timetable container)."""

    __tablename__ = "examinations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exam_type = Column(String(50), nullable=False)
    exam_series = Column(String(20), nullable=True)
    year = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    centre_structure_mode = Column(
        Enum(
            CentreStructureMode,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        server_default=CentreStructureMode.UNIFIED.value,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    schedules = relationship(
        "ExaminationSchedule",
        back_populates="examination",
        cascade="all, delete-orphan",
    )
    candidates = relationship(
        "ExaminationCandidate",
        back_populates="examination",
        cascade="all, delete-orphan",
    )
    subject_script_series = relationship(
        "ExaminationSubjectScriptSeries",
        back_populates="examination",
        cascade="all, delete-orphan",
    )
    examiners = relationship(
        "Examiner",
        back_populates="examination",
        cascade="all, delete-orphan",
        order_by="Examiner.name",
    )
    examiner_groups = relationship(
        "ExaminerGroup",
        back_populates="examination",
        cascade="all, delete-orphan",
        order_by="ExaminerGroup.name",
    )
    examiner_invitations = relationship(
        "ExaminerInvitation",
        back_populates="examination",
        cascade="all, delete-orphan",
        order_by="ExaminerInvitation.created_at",
    )
    examination_centres = relationship(
        "ExaminationCentre",
        back_populates="examination",
        cascade="all, delete-orphan",
        order_by="ExaminationCentre.code",
    )


class ExaminationCentre(Base):
    """Examination centre cluster (not a school); scoped per examination."""

    __tablename__ = "examination_centres"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), nullable=False)
    name = Column(String(255), nullable=False)
    region = Column(Enum(Region), nullable=True)
    zone = Column(Enum(Zone), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="examination_centres")
    memberships = relationship(
        "ExaminationCentreMembership",
        back_populates="examination_centre",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("examination_id", "code", name="uq_examination_centres_exam_code"),
    )


class ExaminationCentreMembership(Base):
    """Links a school to an examination centre for a subject scope (ALL, CORE, or ELECTIVE)."""

    __tablename__ = "examination_centre_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    examination_centre_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_centres.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_scope = Column(
        Enum(
            ExaminationCentreMembershipScope,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="centre_memberships")
    examination_centre = relationship("ExaminationCentre", back_populates="memberships")
    school = relationship("School", backref="examination_centre_memberships")

    __table_args__ = (
        UniqueConstraint(
            "examination_centre_id",
            "school_id",
            "subject_scope",
            name="uq_exam_centre_membership_centre_school_scope",
        ),
        UniqueConstraint(
            "examination_id",
            "school_id",
            "subject_scope",
            name="uq_exam_centre_membership_exam_school_scope",
        ),
    )


class SystemSettings(Base):
    """Singleton application settings; use ``id`` = 1."""

    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True)
    active_examination_id = Column(
        Integer,
        ForeignKey("examinations.id", ondelete="SET NULL"),
        nullable=True,
    )

    active_examination = relationship("Examination", foreign_keys=[active_examination_id])


class ExaminationSubjectScriptSeries(Base):
    """Per examination and subject: how many packing series (1..N) inspectors see; default 1 when no row."""

    __tablename__ = "examination_subject_script_series"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True, index=True)
    series_count = Column(SmallInteger, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="subject_script_series")
    subject = relationship("Subject", backref="examination_script_series_configs")

    __table_args__ = (
        CheckConstraint(
            "series_count >= 1 AND series_count <= 32767",
            name="ck_exam_subject_script_series_count",
        ),
    )


class ExaminationCandidate(Base):
    """Registered candidate for an examination (e.g. imported from registration portal export)."""

    __tablename__ = "examination_candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="SET NULL"), nullable=True, index=True)
    programme_id = Column(Integer, ForeignKey("programmes.id", ondelete="SET NULL"), nullable=True, index=True)
    registration_number = Column(String(50), nullable=False)
    index_number = Column(String(50), nullable=True, index=True)
    full_name = Column(String(512), nullable=False)
    date_of_birth = Column(Date, nullable=True)
    registration_status = Column(String(32), nullable=True)
    source_candidate_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="candidates")
    school = relationship("School")
    programme = relationship("Programme")
    subject_selections = relationship(
        "ExaminationCandidateSubject",
        back_populates="candidate",
        cascade="all, delete-orphan",
        order_by="ExaminationCandidateSubject.id",
    )

    __table_args__ = (
        UniqueConstraint("examination_id", "registration_number", name="uq_examination_candidate_reg_number"),
    )


class ExaminationCandidateSubject(Base):
    """Subject selection for an examination candidate."""

    __tablename__ = "examination_candidate_subjects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    examination_candidate_id = Column(
        Integer,
        ForeignKey("examination_candidates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_code = Column(String(50), nullable=False)
    subject_name = Column(String(255), nullable=False)
    series = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    candidate = relationship("ExaminationCandidate", back_populates="subject_selections")
    subject = relationship("Subject")


class ExaminationSchedule(Base):
    """Per-subject schedule (papers with dates/times) for an examination."""

    __tablename__ = "examination_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    examination_id = Column(
        Integer,
        ForeignKey("examinations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_code = Column(String(50), nullable=False)
    subject_name = Column(String(255), nullable=False)
    papers = Column(JSON, nullable=False)
    venue = Column(String(255), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="schedules")

    __table_args__ = (
        UniqueConstraint("examination_id", "subject_code", name="uq_examination_subject_schedule"),
    )


class ExamDocument(Base):
    """Files uploaded by super admins for supervisors and inspectors to download."""

    __tablename__ = "exam_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    original_filename = Column(String(512), nullable=False)
    stored_path = Column(String(512), unique=True, nullable=False)
    content_type = Column(String(255), nullable=True)
    size_bytes = Column(Integer, nullable=False)
    uploaded_by_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    uploaded_by = relationship("User", back_populates="uploaded_exam_documents")

    __table_args__ = (Index("ix_exam_documents_created_at", "created_at"),)

class ScriptPackingSeries(Base):
    """Per examination, school, subject, paper, and series: envelope booklet counts only."""

    __tablename__ = "script_packing_series"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    paper_number = Column(SmallInteger, nullable=False)
    series_number = Column(SmallInteger, nullable=False)
    updated_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    no_scripts = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="script_packing_series")
    school = relationship("School", backref="script_packing_series")
    subject = relationship("Subject", backref="script_packing_series")
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    verified_by = relationship("User", foreign_keys=[verified_by_id])
    envelopes = relationship(
        "ScriptEnvelope",
        back_populates="packing_series",
        cascade="all, delete-orphan",
        order_by="ScriptEnvelope.envelope_number",
    )

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "school_id",
            "subject_id",
            "paper_number",
            "series_number",
            name="uq_script_packing_series_exam_school_subject_paper_series",
        ),
        CheckConstraint("series_number >= 1 AND series_number <= 32767", name="ck_script_packing_series_number"),
        CheckConstraint("paper_number >= 1", name="ck_script_packing_paper_number"),
    )


class ScriptEnvelope(Base):
    """One physical envelope within a script packing series."""

    __tablename__ = "script_envelopes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    packing_series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("script_packing_series.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    envelope_number = Column(Integer, nullable=False)
    booklet_count = Column(Integer, nullable=False)
    verified_at = Column(DateTime, nullable=True)
    verified_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    packing_series = relationship("ScriptPackingSeries", back_populates="envelopes")
    verified_by = relationship("User", foreign_keys=[verified_by_id])
    allocation_assignments = relationship(
        "AllocationAssignment",
        back_populates="script_envelope",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("packing_series_id", "envelope_number", name="uq_script_envelope_series_number"),
        CheckConstraint("envelope_number >= 1", name="ck_script_envelope_number"),
        CheckConstraint("booklet_count >= 0", name="ck_script_envelope_booklet_count"),
    )


class IrregularScriptPackingSeries(Base):
    """Per examination, school, subject, paper, and series: irregular worked script envelope counts only."""

    __tablename__ = "irregular_script_packing_series"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    paper_number = Column(SmallInteger, nullable=False)
    series_number = Column(SmallInteger, nullable=False)
    updated_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="irregular_script_packing_series")
    school = relationship("School", backref="irregular_script_packing_series")
    subject = relationship("Subject", backref="irregular_script_packing_series")
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    verified_by = relationship("User", foreign_keys=[verified_by_id])
    envelopes = relationship(
        "IrregularScriptEnvelope",
        back_populates="packing_series",
        cascade="all, delete-orphan",
        order_by="IrregularScriptEnvelope.envelope_number",
    )

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "school_id",
            "subject_id",
            "paper_number",
            "series_number",
            name="uq_irreg_pack_series_exam_school_sub_paper_ser",
        ),
        CheckConstraint("series_number >= 1 AND series_number <= 32767", name="ck_irregular_script_packing_series_number"),
        CheckConstraint("paper_number >= 1", name="ck_irregular_script_packing_paper_number"),
    )


class IrregularScriptEnvelope(Base):
    """One physical irregular-script envelope within an irregular script packing series."""

    __tablename__ = "irregular_script_envelopes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    packing_series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("irregular_script_packing_series.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    envelope_number = Column(Integer, nullable=False)
    booklet_count = Column(Integer, nullable=False)
    verified_at = Column(DateTime, nullable=True)
    verified_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    packing_series = relationship("IrregularScriptPackingSeries", back_populates="envelopes")
    verified_by = relationship("User", foreign_keys=[verified_by_id])

    __table_args__ = (
        UniqueConstraint("packing_series_id", "envelope_number", name="uq_irregular_script_envelope_series_number"),
        CheckConstraint("envelope_number >= 1", name="ck_irregular_script_envelope_number"),
        CheckConstraint("booklet_count >= 0", name="ck_irregular_script_envelope_booklet_count"),
    )


class Allocation(Base):
    """One script-allocation exercise (quotas, zone rules, runs) for an examination."""

    __tablename__ = "allocation_campaigns"

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            "paper_number",
            name="uq_allocation_exam_subject_paper",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=False, index=True)
    paper_number = Column(SmallInteger, nullable=False)
    notes = Column(Text, nullable=True)
    allocation_scope = Column(String(16), nullable=False, default="zone")
    cross_marking_rules = Column(JSON, nullable=False, default=lambda: {})
    fairness_weight = Column(Float, nullable=False, default=0.25)
    enforce_single_series_per_examiner = Column(Boolean, nullable=False, default=True)
    exclude_home_zone_or_region = Column(Boolean, nullable=False, default=True)
    solve_mode = Column(String(16), nullable=False, default="monolithic")
    enable_post_rebalance = Column(Boolean, nullable=False, default=False)
    rebalance_tolerance_booklets = Column(Integer, nullable=False, default=20)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="allocation_campaigns")
    subject = relationship("Subject", foreign_keys=[subject_id])
    allocation_runs = relationship(
        "AllocationRun",
        back_populates="allocation",
        cascade="all, delete-orphan",
        order_by="AllocationRun.created_at.desc()",
    )
    scripts_allocation_quotas = relationship(
        "ScriptsAllocationQuota",
        back_populates="allocation",
        cascade="all, delete-orphan",
    )
    selected_examiners = relationship(
        "AllocationExaminer",
        back_populates="allocation",
        cascade="all, delete-orphan",
    )


class AllocationExaminer(Base):
    """Examiner membership for a specific allocation."""

    __tablename__ = "allocation_examiners"

    allocation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("allocation_campaigns.id", ondelete="CASCADE"),
        primary_key=True,
    )
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    allocation = relationship("Allocation", back_populates="selected_examiners")
    examiner = relationship("Examiner", backref="allocation_memberships")


class ScriptsAllocationQuota(Base):
    """Per campaign: target booklet quota for an examiner role and subject (MILP deviation per examiner–subject)."""

    __tablename__ = "scripts_allocation_quotas"

    allocation_id = Column(
        "campaign_id",
        UUID(as_uuid=True),
        ForeignKey("allocation_campaigns.id", ondelete="CASCADE"),
        primary_key=True,
    )
    examiner_type = examiner_type_column(primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True)
    quota_booklets = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    allocation = relationship("Allocation", back_populates="scripts_allocation_quotas")
    subject = relationship("Subject", backref="scripts_allocation_quotas")

    __table_args__ = (
        CheckConstraint("quota_booklets >= 0", name="ck_scripts_allocation_quota_nonneg"),
    )


class ExaminationSubjectMarkingScriptSource(Base):
    """Per examination subject: payout script counts from MILP allocation or manual entry."""

    __tablename__ = "examination_subject_marking_script_sources"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True)
    source_mode = Column(
        Enum(
            MarkingScriptSourceMode,
            values_callable=lambda x: [i.value for i in x],
            create_constraint=False,
        ),
        nullable=False,
        default=MarkingScriptSourceMode.ALLOCATION,
    )
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    examination = relationship("Examination", backref="marking_script_sources")
    subject = relationship("Subject", backref="marking_script_sources")
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])


class ExaminationExaminerManualMarkedScript(Base):
    """Manual marked script counts per examiner, subject, and paper (parallel to MILP assignments)."""

    __tablename__ = "examination_examiner_manual_marked_scripts"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), primary_key=True)
    paper_number = Column(Integer, primary_key=True)
    script_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="manual_marked_scripts")
    subject = relationship("Subject", backref="manual_marked_scripts")
    examiner = relationship("Examiner", backref="manual_marked_scripts")

    __table_args__ = (
        CheckConstraint("paper_number >= 1", name="ck_manual_marked_scripts_paper_number"),
        CheckConstraint("script_count >= 0", name="ck_manual_marked_scripts_count_nonneg"),
    )


class WorkforceAssignmentBatchStatus(enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkforceAvailabilityStatus(enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DECLINED = "declined"


class ScriptChecker(Base):
    """Script checking workforce roster for an examination (token portal, no login)."""

    __tablename__ = "script_checkers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone_number = Column(String(50), nullable=True)
    region = Column(Enum(Region, create_constraint=False), nullable=True)
    reference_code = Column(String(64), nullable=True)
    portal_token = Column(String(128), nullable=False, unique=True, index=True)
    portal_invite_sms_sent_at = Column(DateTime, nullable=True)
    availability_status = Column(
        Enum(
            WorkforceAvailabilityStatus,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=WorkforceAvailabilityStatus.PENDING,
        server_default="pending",
        index=True,
    )
    availability_responded_at = Column(DateTime, nullable=True)
    availability_deadline = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="script_checkers")
    bank_account = relationship(
        "ScriptCheckerBankAccount",
        back_populates="checker",
        cascade="all, delete-orphan",
        uselist=False,
    )
    assignment_batches = relationship(
        "ScriptCheckerAssignmentBatch",
        back_populates="checker",
        cascade="all, delete-orphan",
    )
    sms_deliveries = relationship("SmsDelivery", back_populates="script_checker")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "reference_code",
            name="uq_script_checkers_examination_reference_code",
        ),
    )


class ScriptCheckerBankAccount(Base):
    __tablename__ = "script_checker_bank_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    checker_id = Column(
        UUID(as_uuid=True),
        ForeignKey("script_checkers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    bank_branch_id = Column(UUID(as_uuid=True), ForeignKey("bank_branches.id", ondelete="RESTRICT"), nullable=False, index=True)
    account_number = Column(String(13), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    checker = relationship("ScriptChecker", back_populates="bank_account")
    bank_branch = relationship("BankBranch", back_populates="script_checker_bank_accounts")


class ScriptCheckerAssignmentBatch(Base):
    __tablename__ = "script_checker_assignment_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    paper_number = Column(Integer, nullable=False)
    checker_id = Column(UUID(as_uuid=True), ForeignKey("script_checkers.id", ondelete="CASCADE"), nullable=False, index=True)
    script_count = Column(Integer, nullable=False)
    status = Column(
        Enum(
            WorkforceAssignmentBatchStatus,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=WorkforceAssignmentBatchStatus.ACTIVE,
        server_default="active",
        index=True,
    )
    batch_sequence = Column(Integer, nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    assigned_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    completed_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    checker = relationship("ScriptChecker", back_populates="assignment_batches")
    examination = relationship("Examination", backref="script_checker_assignment_batches")
    subject = relationship("Subject", backref="script_checker_assignment_batches")
    assigned_by = relationship("User", foreign_keys=[assigned_by_user_id])
    completed_by = relationship("User", foreign_keys=[completed_by_user_id])

    __table_args__ = (
        CheckConstraint("paper_number >= 1", name="ck_script_checker_batches_paper"),
        CheckConstraint("script_count >= 0", name="ck_script_checker_batches_count"),
        CheckConstraint("batch_sequence >= 1", name="ck_script_checker_batches_sequence"),
        Index(
            "uq_script_checker_one_active_batch",
            "examination_id",
            "subject_id",
            "paper_number",
            "checker_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )


class DataEntryClerk(Base):
    """Data entry clerk roster for an examination (token portal, no login)."""

    __tablename__ = "data_entry_clerks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone_number = Column(String(50), nullable=True)
    region = Column(Enum(Region, create_constraint=False), nullable=True)
    reference_code = Column(String(64), nullable=True)
    portal_token = Column(String(128), nullable=False, unique=True, index=True)
    portal_invite_sms_sent_at = Column(DateTime, nullable=True)
    availability_status = Column(
        Enum(
            WorkforceAvailabilityStatus,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=WorkforceAvailabilityStatus.PENDING,
        server_default="pending",
        index=True,
    )
    availability_responded_at = Column(DateTime, nullable=True)
    availability_deadline = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="data_entry_clerks")
    bank_account = relationship(
        "DataEntryClerkBankAccount",
        back_populates="clerk",
        cascade="all, delete-orphan",
        uselist=False,
    )
    assignment_batches = relationship(
        "DataEntryClerkAssignmentBatch",
        back_populates="clerk",
        cascade="all, delete-orphan",
    )
    sms_deliveries = relationship("SmsDelivery", back_populates="data_entry_clerk")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "reference_code",
            name="uq_data_entry_clerks_examination_reference_code",
        ),
    )


class DataEntryClerkBankAccount(Base):
    __tablename__ = "data_entry_clerk_bank_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_entry_clerks.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    bank_branch_id = Column(UUID(as_uuid=True), ForeignKey("bank_branches.id", ondelete="RESTRICT"), nullable=False, index=True)
    account_number = Column(String(13), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    clerk = relationship("DataEntryClerk", back_populates="bank_account")
    bank_branch = relationship("BankBranch", back_populates="data_entry_clerk_bank_accounts")


class DataEntryClerkAssignmentBatch(Base):
    __tablename__ = "data_entry_clerk_assignment_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    paper_number = Column(Integer, nullable=False)
    clerk_id = Column(UUID(as_uuid=True), ForeignKey("data_entry_clerks.id", ondelete="CASCADE"), nullable=False, index=True)
    script_count = Column(Integer, nullable=False)
    status = Column(
        Enum(
            WorkforceAssignmentBatchStatus,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=WorkforceAssignmentBatchStatus.ACTIVE,
        server_default="active",
        index=True,
    )
    batch_sequence = Column(Integer, nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    assigned_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    completed_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    clerk = relationship("DataEntryClerk", back_populates="assignment_batches")
    examination = relationship("Examination", backref="data_entry_clerk_assignment_batches")
    subject = relationship("Subject", backref="data_entry_clerk_assignment_batches")
    assigned_by = relationship("User", foreign_keys=[assigned_by_user_id])
    completed_by = relationship("User", foreign_keys=[completed_by_user_id])

    __table_args__ = (
        CheckConstraint("paper_number >= 1", name="ck_data_entry_clerk_batches_paper"),
        CheckConstraint("script_count >= 0", name="ck_data_entry_clerk_batches_count"),
        CheckConstraint("batch_sequence >= 1", name="ck_data_entry_clerk_batches_sequence"),
        Index(
            "uq_data_entry_clerk_one_active_batch",
            "examination_id",
            "subject_id",
            "paper_number",
            "clerk_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )


class ExaminationScriptCheckerRate(Base):
    __tablename__ = "examination_script_checker_rates"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    rate_per_script_ghs = Column(Numeric(12, 2), nullable=False, default=0)
    commuting_allowance_ghs = Column(
        Numeric(12, 2),
        nullable=False,
        default=0,
        server_default="0",
        doc="Commuting allowance per day (GHS); multiplied by work days in payout totals.",
    )
    lunch_allowance_ghs = Column(
        Numeric(12, 2),
        nullable=False,
        default=0,
        server_default="0",
        doc="Lunch allowance per day (GHS); multiplied by work days in payout totals.",
    )
    withholding_tax_percent = Column(
        Numeric(5, 2),
        nullable=False,
        default=10,
        server_default="10",
        doc="Withholding tax percentage applied to gross script earnings.",
    )
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="script_checker_rates")

    __table_args__ = (
        CheckConstraint("rate_per_script_ghs >= 0", name="ck_script_checker_rates_nonneg"),
        CheckConstraint("commuting_allowance_ghs >= 0", name="ck_script_checker_rates_commuting_nonneg"),
        CheckConstraint("lunch_allowance_ghs >= 0", name="ck_script_checker_rates_lunch_nonneg"),
        CheckConstraint(
            "withholding_tax_percent >= 0 AND withholding_tax_percent <= 100",
            name="ck_script_checker_rates_tax_percent_range",
        ),
    )


class ExaminationDataEntryClerkRate(Base):
    __tablename__ = "examination_data_entry_clerk_rates"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    rate_per_script_ghs = Column(Numeric(12, 2), nullable=False, default=0)
    commuting_allowance_ghs = Column(
        Numeric(12, 2),
        nullable=False,
        default=0,
        server_default="0",
        doc="Commuting allowance per day (GHS); multiplied by work days in payout totals.",
    )
    lunch_allowance_ghs = Column(
        Numeric(12, 2),
        nullable=False,
        default=0,
        server_default="0",
        doc="Lunch allowance per day (GHS); multiplied by work days in payout totals.",
    )
    withholding_tax_percent = Column(
        Numeric(5, 2),
        nullable=False,
        default=10,
        server_default="10",
        doc="Withholding tax percentage applied to gross entry earnings.",
    )
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="data_entry_clerk_rates")

    __table_args__ = (
        CheckConstraint("rate_per_script_ghs >= 0", name="ck_data_entry_clerk_rates_nonneg"),
        CheckConstraint("commuting_allowance_ghs >= 0", name="ck_data_entry_clerk_rates_commuting_nonneg"),
        CheckConstraint("lunch_allowance_ghs >= 0", name="ck_data_entry_clerk_rates_lunch_nonneg"),
        CheckConstraint(
            "withholding_tax_percent >= 0 AND withholding_tax_percent <= 100",
            name="ck_data_entry_clerk_rates_tax_percent_range",
        ),
    )


class ExaminerGroup(Base):
    """Per examination: cohort regions (examiner home regions) drive membership and envelope bucketing by school.region."""

    __tablename__ = "examiner_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="examiner_groups")
    members = relationship(
        "ExaminerGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    source_regions = relationship(
        "ExaminerGroupSourceRegion",
        back_populates="group",
        cascade="all, delete-orphan",
    )


class ExaminerGroupMember(Base):
    __tablename__ = "examiner_group_members"

    group_id = Column(UUID(as_uuid=True), ForeignKey("examiner_groups.id", ondelete="CASCADE"), primary_key=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    group = relationship("ExaminerGroup", back_populates="members")
    examiner = relationship("Examiner", back_populates="group_membership")

    __table_args__ = (UniqueConstraint("examiner_id", name="uq_examiner_group_member_examiner"),)


class ExaminerGroupSourceRegion(Base):
    """Cohort region: examiners with this home region belong to the group; schools in this region map to its script bucket."""

    __tablename__ = "examiner_group_source_regions"

    group_id = Column(UUID(as_uuid=True), ForeignKey("examiner_groups.id", ondelete="CASCADE"), primary_key=True)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    region = Column(Enum(Region, create_constraint=False), primary_key=True)

    group = relationship("ExaminerGroup", back_populates="source_regions")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "region",
            name="uq_examiner_group_source_region_per_exam",
        ),
    )


class SubjectMarkingGroup(Base):
    """Subject-scoped marking cohort managed by subject officers (manual membership, coordination dates)."""

    __tablename__ = "subject_marking_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    coordination_start_date = Column(DateTime, nullable=True)
    coordination_start_time = Column(Time, nullable=True)
    coordination_end_date = Column(DateTime, nullable=True)
    coordination_end_time = Column(Time, nullable=True)
    coordination_venue = Column(String(255), nullable=True)
    marking_start_date = Column(DateTime, nullable=True)
    marking_end_date = Column(DateTime, nullable=True)
    marked_script_submission_deadline = Column(DateTime, nullable=True)
    is_default = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="subject_marking_groups")
    subject = relationship("Subject")
    members = relationship(
        "SubjectMarkingGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    source_regions = relationship(
        "SubjectMarkingGroupSourceRegion",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    source_roles = relationship(
        "SubjectMarkingGroupSourceRole",
        back_populates="group",
        cascade="all, delete-orphan",
    )


class SubjectMarkingGroupSourceRegion(Base):
    """Cohort region: subject examiners with this home region belong to the cohort."""

    __tablename__ = "subject_marking_group_source_regions"

    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("subject_marking_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    region = Column(Enum(Region, create_constraint=False), primary_key=True)

    group = relationship("SubjectMarkingGroup", back_populates="source_regions")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            "region",
            name="uq_subject_marking_group_source_region_per_subject",
        ),
    )


class SubjectMarkingGroupSourceRole(Base):
    """Cohort role: subject examiners with this role belong to the cohort."""

    __tablename__ = "subject_marking_group_source_roles"

    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("subject_marking_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    examiner_type = examiner_type_column(primary_key=True)

    group = relationship("SubjectMarkingGroup", back_populates="source_roles")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            "examiner_type",
            name="uq_subject_marking_group_source_role_per_subject",
        ),
    )


class SubjectMarkingGroupMember(Base):
    __tablename__ = "subject_marking_group_members"

    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("subject_marking_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), primary_key=True)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    group = relationship("SubjectMarkingGroup", back_populates="members")
    examiner = relationship("Examiner", back_populates="subject_marking_group_memberships")


class Examiner(Base):
    """Examiner roster for an examination; eligible for script allocation for any campaign on that exam."""

    __tablename__ = "examiners"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(
        Integer,
        ForeignKey("examinations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    examiner_type = examiner_type_column(nullable=False)
    region = Column(Enum(Region, create_constraint=False), nullable=False)
    deviation_weight = Column(
        Float,
        nullable=True,
        doc="Optional MILP weight for L1 deviation; if null, a default by examiner_type is used.",
    )
    phone_number = Column(String(50), nullable=True)
    msisdn = Column(String(20), nullable=True, index=True)
    gender = Column(String(20), nullable=True)
    appointment_letter_notified_at = Column(DateTime, nullable=True)
    portal_token = Column(String(128), nullable=False, unique=True, index=True)
    reference_code = Column(String(64), nullable=True)
    roster_source = Column(
        Enum(
            ExaminerRosterSource,
            values_callable=lambda x: [i.value for i in x],
            create_constraint=False,
        ),
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="examiners")
    subjects = relationship(
        "ExaminerSubject",
        back_populates="examiner",
        cascade="all, delete-orphan",
    )
    group_membership = relationship(
        "ExaminerGroupMember",
        back_populates="examiner",
        cascade="all, delete-orphan",
        uselist=False,
    )
    subject_marking_group_memberships = relationship(
        "SubjectMarkingGroupMember",
        back_populates="examiner",
        cascade="all, delete-orphan",
    )
    allocation_assignments = relationship(
        "AllocationAssignment",
        back_populates="examiner",
        passive_deletes=True,
    )
    invitation = relationship(
        "ExaminerInvitation",
        back_populates="examiner",
        uselist=False,
    )
    bank_account = relationship(
        "ExaminerBankAccount",
        back_populates="examiner",
        cascade="all, delete-orphan",
        uselist=False,
    )
    sms_deliveries = relationship(
        "SmsDelivery",
        back_populates="examiner",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "deviation_weight IS NULL OR deviation_weight > 0",
            name="ck_examiner_deviation_weight_positive",
        ),
        UniqueConstraint(
            "msisdn",
            name="uq_examiners_msisdn_global",
        ),
        UniqueConstraint(
            "examination_id",
            "reference_code",
            name="uq_examiners_examination_reference_code",
        ),
    )


class ExaminerBankAccount(Base):
    """One bank account per examiner for allowance processing."""

    __tablename__ = "examiner_bank_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examiner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examiners.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    bank_branch_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bank_branches.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    account_number = Column(String(13), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examiner = relationship("Examiner", back_populates="bank_account")
    bank_branch = relationship("BankBranch", back_populates="examiner_bank_accounts")


class ExaminerSubject(Base):
    __tablename__ = "examiner_subjects"

    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True)

    examiner = relationship("Examiner", back_populates="subjects")
    subject = relationship("Subject", backref="examiner_subject_links")


class ExaminerInvitation(Base):
    """SMS invitation for a prospective examiner; roster entry created on accept."""

    __tablename__ = "examiner_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(
        Integer,
        ForeignKey("examinations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone_number = Column(String(50), nullable=False)
    msisdn = Column(String(20), nullable=False, index=True)
    gender = Column(String(20), nullable=True)
    examiner_type = examiner_type_column(nullable=False)
    region = Column(Enum(Region, create_constraint=False), nullable=False)
    token = Column(String(128), nullable=False, unique=True, index=True)
    token_expires_at = Column(DateTime, nullable=False)
    status = Column(
        Enum(
            ExaminerInvitationStatus,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        default=ExaminerInvitationStatus.PENDING,
        server_default="pending",
        index=True,
    )
    invited_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notified_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    response_deadline = Column(DateTime, nullable=False)
    coordination_start_date = Column(DateTime, nullable=True)
    coordination_start_time = Column(Time, nullable=True)
    coordination_end_date = Column(DateTime, nullable=True)
    coordination_end_time = Column(Time, nullable=True)
    coordination_venue = Column(String(255), nullable=True)
    examiner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examiners.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="examiner_invitations")
    subject = relationship("Subject")
    invited_by = relationship("User", foreign_keys=[invited_by_user_id])
    examiner = relationship("Examiner", back_populates="invitation")
    sms_deliveries = relationship(
        "SmsDelivery",
        back_populates="examiner_invitation",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "msisdn",
            name="uq_examiner_invitations_msisdn_global",
        ),
    )


class SubjectOfficerAssignment(Base):
    """Subject scope for a subject officer on an examination."""

    __tablename__ = "subject_officer_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    examination_id = Column(
        Integer,
        ForeignKey("examinations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id], back_populates="subject_officer_assignments")
    examination = relationship("Examination", backref="subject_officer_assignments")
    subject = relationship("Subject")
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "examination_id",
            "subject_id",
            name="uq_subject_officer_assignment_user_exam_subject",
        ),
    )


class ExaminerMarkedScriptReturn(Base):
    """Marking-centre return verification for an examiner's allocated scripts."""

    __tablename__ = "examiner_marked_script_returns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    paper_number = Column(SmallInteger, nullable=False)
    allocation_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("allocation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    allocation_assignment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("allocation_assignments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    expected_booklets = Column(Integer, nullable=False)
    returned_booklets = Column(Integer, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_marked_script_returns")
    subject = relationship("Subject")
    examiner = relationship("Examiner", backref="marked_script_returns")
    allocation_run = relationship("AllocationRun")
    allocation_assignment = relationship("AllocationAssignment")
    verified_by = relationship("User", foreign_keys=[verified_by_id])

    __table_args__ = (
        CheckConstraint("expected_booklets >= 0", name="ck_examiner_marked_script_return_expected"),
        CheckConstraint(
            "returned_booklets IS NULL OR returned_booklets >= 0",
            name="ck_examiner_marked_script_return_returned",
        ),
    )


class SubjectExaminerRegionQuota(Base):
    """Per-subject regional headcount cap for examiner roster (by region group and optional role)."""

    __tablename__ = "subject_examiner_region_quotas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_examiner_quota_region_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    examiner_type = examiner_type_column(nullable=True)
    quota_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="subject_examiner_region_quotas")
    subject = relationship("Subject", backref="subject_examiner_region_quotas")
    group = relationship("ExaminationExaminerQuotaRegionGroup", backref="subject_quotas")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            "group_id",
            "examiner_type",
            name="uq_subject_examiner_region_quotas_exam_subj_grp_type",
        ),
        CheckConstraint("quota_count >= 0", name="ck_subject_examiner_region_quotas_nonneg"),
    )


class SubjectExaminerQuotaSettings(Base):
    """Per-subject examiner headcount targets (total + optional nationwide gender caps)."""

    __tablename__ = "subject_examiner_quota_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    total_quota = Column(Integer, nullable=True)
    male_quota = Column(Integer, nullable=True)
    female_quota = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="subject_examiner_quota_settings")
    subject = relationship("Subject", backref="subject_examiner_quota_settings")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            name="uq_subject_examiner_quota_settings_exam_subj",
        ),
        CheckConstraint(
            "total_quota IS NULL OR total_quota >= 0",
            name="ck_subject_examiner_quota_settings_nonneg",
        ),
        CheckConstraint(
            "male_quota IS NULL OR male_quota >= 0",
            name="ck_subject_examiner_quota_settings_male_nonneg",
        ),
        CheckConstraint(
            "female_quota IS NULL OR female_quota >= 0",
            name="ck_subject_examiner_quota_settings_female_nonneg",
        ),
    )


class ExaminerAttendance(Base):
    """Per-day examiner attendance check-in for an examination (QR scan by reference code)."""

    __tablename__ = "examiner_attendances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(
        Integer,
        ForeignKey("examinations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    examiner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examiners.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attendance_date = Column(Date, nullable=False)
    reference_code = Column(String(16), nullable=False)
    marked_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    marked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_attendances")
    examiner = relationship("Examiner", backref="attendances")
    marked_by = relationship("User", foreign_keys=[marked_by_user_id])

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "examiner_id",
            "attendance_date",
            name="uq_examiner_attendances_exam_examiner_date",
        ),
    )


class LunchCouponVerification(Base):
    """Subject-officer lunch coupon verification for an examiner on an examination."""

    __tablename__ = "lunch_coupon_verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(
        Integer,
        ForeignKey("examinations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    examiner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examiners.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reference_code = Column(String(16), nullable=False)
    verification_date = Column(Date, nullable=False)
    verified_by_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    verified_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="lunch_coupon_verifications")
    examiner = relationship("Examiner", backref="lunch_coupon_verifications")
    verified_by = relationship("User", foreign_keys=[verified_by_id])

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "examiner_id",
            "verification_date",
            name="uq_lunch_coupon_verifications_exam_examiner_date",
        ),
    )


class AllocationRun(Base):
    """One MILP solve attempt for a campaign."""

    __tablename__ = "allocation_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    allocation_id = Column(
        "campaign_id",
        UUID(as_uuid=True),
        ForeignKey("allocation_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(Enum(AllocationRunStatus, create_constraint=False), nullable=False)
    objective_value = Column(Float, nullable=True)
    solver_message = Column(Text, nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    solver_stats = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    allocation = relationship("Allocation", back_populates="allocation_runs")
    created_by = relationship("User", foreign_keys=[created_by_id])
    assignments = relationship(
        "AllocationAssignment",
        back_populates="allocation_run",
        cascade="all, delete-orphan",
    )


class AllocationAssignment(Base):
    """Assignment of one physical script envelope to an examiner for a given run."""

    __tablename__ = "allocation_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    allocation_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("allocation_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    script_envelope_id = Column(
        UUID(as_uuid=True),
        ForeignKey("script_envelopes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), nullable=False, index=True)
    booklet_count = Column(Integer, nullable=False)

    allocation_run = relationship("AllocationRun", back_populates="assignments")
    script_envelope = relationship("ScriptEnvelope", back_populates="allocation_assignments")
    examiner = relationship("Examiner", back_populates="allocation_assignments")

    __table_args__ = (
        UniqueConstraint("allocation_run_id", "script_envelope_id", name="uq_allocation_assignment_run_envelope"),
        CheckConstraint("booklet_count >= 0", name="ck_allocation_assignment_booklet_count"),
    )


class ExamOfficialDesignation(enum.Enum):
    """Role label for personnel at an examination school (inspector capture form)."""

    DEPOT_KEEPER = "Depot Keeper"
    SUPERVISOR = "Supervisor"
    ASSISTANT_SUPERVISOR = "Assistant Supervisor"
    INVIGILATOR = "Invigilator"
    POLICE_OFFICER = "Police Officer"
    EXTERNAL_INSPECTOR = "External Inspector"


class ExamInspectorSubjectScope(enum.Enum):
    """Subject scope for an inspector's posting at an examination centre."""

    ALL = "ALL"
    CORE = "CORE"
    ELECTIVE = "ELECTIVE"


class BankBranch(Base):
    """Ghana bank branch directory (6-digit sort code); super-admin bulk upload, inspector pickers."""

    __tablename__ = "bank_branches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bank_code = Column(String(32), unique=True, nullable=False, index=True)
    bank_name = Column(String(255), nullable=False)
    branch_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    exam_officials = relationship("ExamCentreOfficial", back_populates="bank_branch")
    examiner_bank_accounts = relationship("ExaminerBankAccount", back_populates="bank_branch")
    script_checker_bank_accounts = relationship("ScriptCheckerBankAccount", back_populates="bank_branch")
    data_entry_clerk_bank_accounts = relationship("DataEntryClerkBankAccount", back_populates="bank_branch")


class ExamCentreOfficial(Base):
    """Examination official payment/contact details per examination centre (host school)."""

    __tablename__ = "exam_centre_officials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    examination_centre_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_centres.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    full_name = Column(String(255), nullable=False)
    designation = Column(
        Enum(
            ExamOfficialDesignation,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
    )
    bank_branch_id = Column(UUID(as_uuid=True), ForeignKey("bank_branches.id", ondelete="RESTRICT"), nullable=False, index=True)
    account_number = Column(String(13), nullable=False)
    num_days = Column(SmallInteger, nullable=False)
    telephone_number = Column(String(10), nullable=False)
    subject_scope = Column(
        Enum(
            ExamInspectorSubjectScope,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        doc="CORE or ELECTIVE roster scope for this official.",
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="exam_centre_officials")
    examination_centre = relationship(
        "ExaminationCentre",
        foreign_keys=[examination_centre_id],
        backref="exam_centre_officials",
    )
    bank_branch = relationship("BankBranch", back_populates="exam_officials")

    __table_args__ = (
        CheckConstraint("num_days >= 1", name="ck_exam_school_official_num_days"),
        CheckConstraint("length(account_number) = 13 AND account_number ~ '^[0-9]{13}$'", name="ck_exam_school_official_account"),
        CheckConstraint(
            "length(telephone_number) = 10 AND telephone_number ~ '^[0-9]{10}$'",
            name="ck_exam_school_official_telephone_gh",
        ),
        Index(
            "ix_exam_centre_officials_exam_centre",
            "examination_id",
            "examination_centre_id",
        ),
        Index(
            "ix_exam_centre_officials_exam_centre_scope",
            "examination_id",
            "examination_centre_id",
            "subject_scope",
        ),
    )


class ExaminationDesignationRate(Base):
    """Per-examination allowance rates by official designation (finance officer)."""

    __tablename__ = "examination_designation_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    designation = Column(
        Enum(
            ExamOfficialDesignation,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
    )
    daily_rate_ghs = Column(Numeric(12, 2), nullable=True)
    commuting_allowance_ghs = Column(
        Numeric(12, 2),
        nullable=True,
        doc="Commuting allowance per day (GHS); multiplied by roster num_days in totals.",
    )
    airtime_ghs = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="designation_rates")

    __table_args__ = (
        UniqueConstraint("examination_id", "designation", name="uq_examination_designation_rates_exam_designation"),
        CheckConstraint(
            "daily_rate_ghs IS NULL OR daily_rate_ghs >= 0",
            name="ck_examination_designation_rates_daily_nonneg",
        ),
        CheckConstraint(
            "commuting_allowance_ghs IS NULL OR commuting_allowance_ghs >= 0",
            name="ck_examination_designation_rates_commuting_nonneg",
        ),
        CheckConstraint(
            "airtime_ghs IS NULL OR airtime_ghs >= 0",
            name="ck_examination_designation_rates_airtime_nonneg",
        ),
    )


class ExaminationExaminerRoleAllowanceRate(Base):
    """Per-examination flat role allowance amounts (paid once per examiner by role)."""

    __tablename__ = "examination_examiner_role_allowance_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    examiner_type = examiner_type_column(nullable=False)
    allowance_type = Column(
        Enum(
            ExaminerAllowanceType,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
    )
    amount_ghs = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_role_allowance_rates")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "examiner_type",
            "allowance_type",
            name="uq_exam_examiner_role_allowance_rates",
        ),
        CheckConstraint(
            "amount_ghs IS NULL OR amount_ghs >= 0",
            name="ck_exam_examiner_role_allowance_rates_amount_nonneg",
        ),
    )


class ExaminationExaminerMarkingRate(Base):
    """Per-examination marking rate per script by subject and paper (same for all roles)."""

    __tablename__ = "examination_examiner_marking_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    paper_number = Column(SmallInteger, nullable=False, default=1)
    rate_per_script_ghs = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_marking_rates")
    subject = relationship("Subject")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            "paper_number",
            name="uq_examination_examiner_marking_rates_exam_subject_paper",
        ),
        CheckConstraint("paper_number >= 1", name="ck_examination_examiner_marking_rates_paper_number"),
        CheckConstraint(
            "rate_per_script_ghs IS NULL OR rate_per_script_ghs >= 0",
            name="ck_examination_examiner_marking_rates_rate_nonneg",
        ),
    )


class ExaminationExaminerTravelRate(Base):
    """Per-examination travel and transport (T&T) allowance by examiner home region."""

    __tablename__ = "examination_examiner_travel_rates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    region = Column(
        Enum(
            Region,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
    )
    amount_ghs = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_travel_rates")

    __table_args__ = (
        UniqueConstraint("examination_id", "region", name="uq_examination_examiner_travel_rates_exam_region"),
        CheckConstraint(
            "amount_ghs IS NULL OR amount_ghs >= 0",
            name="ck_examination_examiner_travel_rates_amount_nonneg",
        ),
    )


class ExaminationExaminerQuotaRegionGroup(Base):
    """Per-examination region group for examiner roster quotas (independent of reference-code groups)."""

    __tablename__ = "examination_examiner_quota_region_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_quota_region_groups")
    regions = relationship(
        "ExaminationExaminerQuotaRegionGroupRegion",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_exam_quota_rg_groups_exam_id", "examination_id"),
    )


class ExaminationExaminerQuotaRegionGroupRegion(Base):
    """Maps an examiner home region to a quota region group within an examination."""

    __tablename__ = "examination_examiner_quota_region_group_regions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_examiner_quota_region_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    region = Column(
        Enum(
            Region,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    group = relationship("ExaminationExaminerQuotaRegionGroup", back_populates="regions")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "region",
            name="uq_exam_quota_rg_regions_exam_region",
        ),
        Index("ix_exam_quota_rg_regions_exam_id", "examination_id"),
        Index("ix_exam_quota_rg_regions_group_id", "group_id"),
    )


class ExaminationExaminerRegionGroup(Base):
    """Per-examination region group for stable examiner reference codes (e.g. N, S, E, M)."""

    __tablename__ = "examination_examiner_region_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(64), nullable=False)
    code_prefix = Column(String(2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_region_groups")
    regions = relationship(
        "ExaminationExaminerRegionGroupRegion",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "code_prefix",
            name="uq_examination_examiner_region_groups_exam_prefix",
        ),
    )


class ExaminationExaminerRegionGroupRegion(Base):
    """Maps an examiner home region to a reference-code group within an examination."""

    __tablename__ = "examination_examiner_region_group_regions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_examiner_region_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    region = Column(
        Enum(
            Region,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    group = relationship("ExaminationExaminerRegionGroup", back_populates="regions")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "region",
            name="uq_examination_examiner_region_group_regions_exam_region",
        ),
    )


class ExaminationExaminerTravelZone(Base):
    """Per-examination custom T&T zone (groups regions for role multipliers)."""

    __tablename__ = "examination_examiner_travel_zones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(64), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_travel_zones")
    regions = relationship(
        "ExaminationExaminerTravelZoneRegion",
        back_populates="zone",
        cascade="all, delete-orphan",
    )
    role_factors = relationship(
        "ExaminationExaminerTravelRoleFactor",
        back_populates="zone",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "name",
            name="uq_examination_examiner_travel_zones_exam_name",
        ),
    )


class ExaminationExaminerTravelZoneRegion(Base):
    """Maps an examiner home region to a T&T zone within an examination."""

    __tablename__ = "examination_examiner_travel_zone_regions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_examiner_travel_zones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    region = Column(
        Enum(
            Region,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    zone = relationship("ExaminationExaminerTravelZone", back_populates="regions")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "region",
            name="uq_examination_examiner_travel_zone_regions_exam_region",
        ),
    )


class ExaminationExaminerTravelRoleFactor(Base):
    """Per-examination T&T multiplier by examiner role and T&T zone (default 1 when unset)."""

    __tablename__ = "examination_examiner_travel_role_factors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    zone_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_examiner_travel_zones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    examiner_type = examiner_type_column(nullable=False)
    factor = Column(Numeric(6, 3), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_travel_role_factors")
    zone = relationship("ExaminationExaminerTravelZone", back_populates="role_factors")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "examiner_type",
            "zone_id",
            name="uq_examination_examiner_travel_role_factors_exam_role_zone",
        ),
        CheckConstraint(
            "factor IS NULL OR factor > 0",
            name="ck_examination_examiner_travel_role_factors_factor_positive",
        ),
    )


class InspectorExamPosting(Base):
    """Per examination: inspector operational posting to a centre host with subject scope."""

    __tablename__ = "inspector_exam_postings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    inspector_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    examination_centre_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_centres.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_scope = Column(
        Enum(
            ExamInspectorSubjectScope,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
    )
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="inspector_exam_postings")
    inspector_user = relationship("User", foreign_keys=[inspector_user_id], backref="inspector_exam_postings")
    examination_centre = relationship(
        "ExaminationCentre",
        foreign_keys=[examination_centre_id],
        backref="inspector_exam_postings",
    )
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        Index("ix_inspector_exam_postings_exam_inspector", "examination_id", "inspector_user_id"),
        UniqueConstraint(
            "examination_id",
            "examination_centre_id",
            "inspector_user_id",
            "subject_scope",
            name="uq_inspector_postings_exam_centre_inspector_scope",
        ),
    )


class InspectorAttendanceSheet(Base):
    """Inspector-uploaded attendance sheet (PDF/image) for an examination centre host and scheduled date."""

    __tablename__ = "inspector_attendance_sheets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    inspector_exam_posting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("inspector_exam_postings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    examination_centre_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_centres.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    examination_date = Column(Date, nullable=False)
    subject_scope = Column(
        Enum(
            ExamInspectorSubjectScope,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
        doc="CORE or ELECTIVE scope inferred from timetable for this date.",
    )
    notes = Column(Text, nullable=True)
    original_filename = Column(String(512), nullable=False)
    stored_path = Column(String(512), unique=True, nullable=False)
    content_type = Column(String(255), nullable=True)
    size_bytes = Column(Integer, nullable=False)
    uploaded_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="inspector_attendance_sheets")
    inspector_exam_posting = relationship("InspectorExamPosting", backref="attendance_sheets")
    examination_centre = relationship(
        "ExaminationCentre",
        foreign_keys=[examination_centre_id],
        backref="inspector_attendance_sheets",
    )
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])

    __table_args__ = (
        Index(
            "ix_inspector_attendance_sheets_exam_posting",
            "examination_id",
            "inspector_exam_posting_id",
        ),
        Index(
            "ix_inspector_attendance_sheets_exam_centre_date",
            "examination_id",
            "examination_centre_id",
            "examination_date",
        ),
        Index(
            "ix_inspector_attendance_sheets_exam_centre_date_scope",
            "examination_id",
            "examination_centre_id",
            "examination_date",
            "subject_scope",
        ),
    )


class ExaminationExaminerAppointmentLetterReference(Base):
    """Per examination, subject, and role: shared appointment letter reference number."""

    __tablename__ = "examination_examiner_appointment_letter_references"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    examiner_type = examiner_type_column(nullable=False)
    reference_number = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_appointment_letter_references")
    subject = relationship("Subject")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            "examiner_type",
            name="uq_exam_examiner_appt_letter_refs",
        ),
    )


class ExaminationExaminerPortalSettings(Base):
    """Per examination: when appointment letters and bank upload may be released to examiners."""

    __tablename__ = "examination_examiner_portal_settings"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    appointment_letters_release_enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    appointment_letters_release_mode = Column(
        String(32),
        nullable=False,
        default="scheduled_date",
        server_default="scheduled_date",
    )
    appointment_letters_release_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_portal_settings")


class AppointmentLettersReleaseMode(enum.Enum):
    ON_ACCEPTANCE = "on_acceptance"
    SCHEDULED_DATE = "scheduled_date"


class AppointmentLetterSigningOfficial(enum.Enum):
    DIRECTOR_GENERAL = "director_general"
    DIRECTOR_ASSESSMENT_CERTIFICATION = "director_assessment_certification"


class ExaminationExaminerAppointmentLetterSettings(Base):
    """Per examination: signatory names, signatures, CC lines for appointment letters."""

    __tablename__ = "examination_examiner_appointment_letter_settings"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    signing_official = Column(
        Enum(
            AppointmentLetterSigningOfficial,
            values_callable=lambda x: [e.value for e in x],
            native_enum=False,
            length=64,
        ),
        nullable=False,
        default=AppointmentLetterSigningOfficial.DIRECTOR_ASSESSMENT_CERTIFICATION,
        server_default=AppointmentLetterSigningOfficial.DIRECTOR_ASSESSMENT_CERTIFICATION.value,
    )
    signed_for_director_general = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    director_general_name = Column(String(255), nullable=True)
    director_general_title = Column(String(255), nullable=True)
    director_general_signature_path = Column(String(512), nullable=True)
    director_assessment_name = Column(String(255), nullable=True)
    director_assessment_title = Column(String(255), nullable=True)
    director_assessment_signature_path = Column(String(512), nullable=True)
    valediction = Column(String(255), nullable=False, default="Yours faithfully", server_default="Yours faithfully")
    letter_date = Column(Date, nullable=True)
    cc_lines = Column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_appointment_letter_settings")


class ExaminationExaminerAppointmentLetterSubjectSettings(Base):
    """Per examination + subject: DAC signatory overrides for appointment letters."""

    __tablename__ = "examination_examiner_appointment_letter_subject_settings"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), primary_key=True)
    director_assessment_name = Column(String(255), nullable=True)
    director_assessment_title = Column(String(255), nullable=True)
    director_assessment_signature_path = Column(String(512), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="examiner_appointment_letter_subject_settings")
    subject = relationship("Subject")

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "subject_id",
            name="uq_exam_examiner_appt_letter_subject_settings",
        ),
    )


class ExaminationInspectorSubmissionSettings(Base):
    """Per examination: inspector submission window and official-upload scope toggles."""

    __tablename__ = "examination_inspector_submission_settings"

    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), primary_key=True)
    core_submission_period_start = Column(Date, nullable=True)
    core_submission_period_end = Column(Date, nullable=True)
    elective_submission_period_start = Column(Date, nullable=True)
    elective_submission_period_end = Column(Date, nullable=True)
    officials_core_enabled = Column(Boolean, nullable=False, default=True)
    officials_elective_enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="inspector_submission_settings")


class QuestionPaperControl(Base):
    """Per examination centre, subject, paper, and series: question paper stock counts."""

    __tablename__ = "question_paper_control"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    examination_centre_id = Column(
        UUID(as_uuid=True),
        ForeignKey("examination_centres.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False, index=True)
    paper_number = Column(SmallInteger, nullable=False)
    series_number = Column(SmallInteger, nullable=False)
    copies_received = Column(Integer, nullable=False, default=0)
    copies_used = Column(Integer, nullable=False, default=0)
    copies_to_library = Column(Integer, nullable=False, default=0)
    copies_remaining = Column(Integer, nullable=False, default=0)
    updated_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    verified_at = Column(DateTime, nullable=True)
    verified_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", backref="question_paper_controls")
    examination_centre = relationship(
        "ExaminationCentre",
        foreign_keys=[examination_centre_id],
        backref="question_paper_controls",
    )
    subject = relationship("Subject", backref="question_paper_controls")
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    verified_by = relationship("User", foreign_keys=[verified_by_id])

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "examination_centre_id",
            "subject_id",
            "paper_number",
            "series_number",
            name="uq_question_paper_control_exam_centre_subject_paper_series",
        ),
        CheckConstraint("series_number >= 1 AND series_number <= 32767", name="ck_question_paper_control_series"),
        CheckConstraint("paper_number >= 1", name="ck_question_paper_control_paper"),
        CheckConstraint("copies_received >= 0", name="ck_question_paper_control_received"),
        CheckConstraint("copies_used >= 0", name="ck_question_paper_control_used"),
        CheckConstraint("copies_to_library >= 0", name="ck_question_paper_control_library"),
        CheckConstraint("copies_remaining >= 0", name="ck_question_paper_control_remaining"),
    )


class CentreLocationSource(enum.Enum):
    """How a centre_locations row was recorded."""

    INSPECTOR_GPS = "INSPECTOR_GPS"
    ADMIN_MANUAL = "ADMIN_MANUAL"


class CentreLocation(Base):
    """GPS coordinates for an examination centre, keyed by stable centre code (cross-examination)."""

    __tablename__ = "centre_locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    centre_code = Column(String(32), nullable=False, unique=True, index=True)
    latitude = Column(Numeric(9, 6), nullable=False)
    longitude = Column(Numeric(9, 6), nullable=False)
    accuracy_m = Column(Float, nullable=True)
    source = Column(
        Enum(
            CentreLocationSource,
            values_callable=lambda x: [i.value for i in x],
            native_enum=False,
            length=16,
        ),
        nullable=False,
    )
    captured_at = Column(DateTime, nullable=False)
    captured_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    captured_by = relationship("User", foreign_keys=[captured_by_user_id])

    __table_args__ = (
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_centre_locations_latitude"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_centre_locations_longitude"),
    )
