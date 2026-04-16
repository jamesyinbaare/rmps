import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, Column, Date, DateTime, Enum, Float, ForeignKey, Index, Integer, SmallInteger, String, Table, Text, UniqueConstraint
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
    ASSISTANT = "assistant_examiner"
    TEAM_LEADER = "team_leader"


class AllocationRunStatus(enum.Enum):
    DRAFT = "draft"
    OPTIMAL = "optimal"
    INFEASIBLE = "infeasible"
    TIMEOUT = "timeout"
    ERROR = "error"


class UserRole(enum.IntEnum):
    """User roles for exam-tools. Lower values have higher privileges."""

    SUPER_ADMIN = 0
    TEST_ADMIN_OFFICER = 5
    SUPERVISOR = 10
    INSPECTOR = 20
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


class Examination(Base):
    """Certificate examination instance (timetable container)."""

    __tablename__ = "examinations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exam_type = Column(String(50), nullable=False)
    exam_series = Column(String(20), nullable=True)
    year = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
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
    examiner_type = Column(Enum(ExaminerType, create_constraint=False), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True)
    quota_booklets = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    allocation = relationship("Allocation", back_populates="scripts_allocation_quotas")
    subject = relationship("Subject", backref="scripts_allocation_quotas")

    __table_args__ = (
        CheckConstraint("quota_booklets >= 0", name="ck_scripts_allocation_quota_nonneg"),
    )


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
    examiner_type = Column(Enum(ExaminerType, create_constraint=False), nullable=False)
    region = Column(Enum(Region, create_constraint=False), nullable=True)
    zone = Column(Enum(Zone, create_constraint=False), nullable=True)
    deviation_weight = Column(
        Float,
        nullable=True,
        doc="Optional MILP weight for L1 deviation; if null, a default by examiner_type is used.",
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    examination = relationship("Examination", back_populates="examiners")
    subjects = relationship(
        "ExaminerSubject",
        back_populates="examiner",
        cascade="all, delete-orphan",
    )
    allowed_zones = relationship(
        "ExaminerAllowedZone",
        back_populates="examiner",
        cascade="all, delete-orphan",
    )
    allocation_assignments = relationship(
        "AllocationAssignment",
        back_populates="examiner",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "deviation_weight IS NULL OR deviation_weight > 0",
            name="ck_examiner_deviation_weight_positive",
        ),
    )


class ExaminerSubject(Base):
    __tablename__ = "examiner_subjects"

    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True)

    examiner = relationship("Examiner", back_populates="subjects")
    subject = relationship("Subject", backref="examiner_subject_links")


class ExaminerAllowedZone(Base):
    """Source school zones from which this examiner may receive scripts."""

    __tablename__ = "examiner_allowed_zones"

    examiner_id = Column(UUID(as_uuid=True), ForeignKey("examiners.id", ondelete="CASCADE"), primary_key=True)
    zone = Column(Enum(Zone, create_constraint=False), primary_key=True)

    examiner = relationship("Examiner", back_populates="allowed_zones")


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


class QuestionPaperControl(Base):
    """Per examination centre (host school), subject, paper, and series: question paper stock counts."""

    __tablename__ = "question_paper_control"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    examination_id = Column(Integer, ForeignKey("examinations.id", ondelete="CASCADE"), nullable=False, index=True)
    center_id = Column(
        UUID(as_uuid=True),
        ForeignKey("schools.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Examination centre host school id (schools.writes_at_center_id IS NULL).",
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
    center = relationship("School", foreign_keys=[center_id], backref="question_paper_controls")
    subject = relationship("Subject", backref="question_paper_controls")
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    verified_by = relationship("User", foreign_keys=[verified_by_id])

    __table_args__ = (
        UniqueConstraint(
            "examination_id",
            "center_id",
            "subject_id",
            "paper_number",
            "series_number",
            name="uq_question_paper_control_exam_center_subject_paper_series",
        ),
        CheckConstraint("series_number >= 1 AND series_number <= 32767", name="ck_question_paper_control_series"),
        CheckConstraint("paper_number >= 1", name="ck_question_paper_control_paper"),
        CheckConstraint("copies_received >= 0", name="ck_question_paper_control_received"),
        CheckConstraint("copies_used >= 0", name="ck_question_paper_control_used"),
        CheckConstraint("copies_to_library >= 0", name="ck_question_paper_control_library"),
        CheckConstraint("copies_remaining >= 0", name="ck_question_paper_control_remaining"),
    )
