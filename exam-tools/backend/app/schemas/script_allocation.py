from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ExaminerTypeSchema(str, Enum):
    chief_examiner = "chief_examiner"
    assistant_examiner = "assistant_examiner"
    team_leader = "team_leader"


class AllocationRunStatusSchema(str, Enum):
    draft = "draft"
    optimal = "optimal"
    infeasible = "infeasible"
    timeout = "timeout"
    error = "error"


class AllocationScopeSchema(str, Enum):
    zone = "zone"
    region = "region"


class AllocationSolveModeSchema(str, Enum):
    """monolithic: one MILP over all examiners and envelopes. decomposed: by marking group then series."""

    monolithic = "monolithic"
    decomposed = "decomposed"


class AllocationSubgroupStatusSchema(str, Enum):
    optimal = "optimal"
    stopped_feasible = "stopped_feasible"
    skipped_empty = "skipped_empty"
    infeasible = "infeasible"
    timeout = "timeout"
    error = "error"


class AllocationCreate(BaseModel):
    examination_id: int
    name: str | None = Field(default=None, min_length=1, max_length=255)
    subject_id: int
    paper_number: int = Field(ge=1)
    notes: str | None = None


class AllocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    subject_id: int | None = Field(default=None)
    paper_number: int | None = Field(default=None, ge=1)
    notes: str | None = None
    allocation_scope: AllocationScopeSchema | None = None
    cross_marking_rules: dict[str, list[str]] | None = None
    fairness_weight: float | None = Field(default=None, ge=0)
    enforce_single_series_per_examiner: bool | None = None
    exclude_home_zone_or_region: bool | None = None
    solve_mode: AllocationSolveModeSchema | None = None
    enable_post_rebalance: bool | None = None
    rebalance_tolerance_booklets: int | None = Field(default=None, ge=0)


class AllocationResponse(BaseModel):
    id: UUID
    examination_id: int
    name: str
    subject_id: int
    paper_number: int
    notes: str | None
    allocation_scope: AllocationScopeSchema
    cross_marking_rules: dict[str, list[str]]
    fairness_weight: float
    enforce_single_series_per_examiner: bool
    exclude_home_zone_or_region: bool
    solve_mode: AllocationSolveModeSchema
    enable_post_rebalance: bool
    rebalance_tolerance_booklets: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("solve_mode", mode="before")
    @classmethod
    def _coerce_solve_mode(cls, v: object) -> object:
        if v is None or v == "":
            return AllocationSolveModeSchema.monolithic
        return v

    @field_validator("allocation_scope", mode="before")
    @classmethod
    def _coerce_allocation_scope(cls, v: object) -> object:
        if isinstance(v, str):
            return AllocationScopeSchema(v)
        return v

    @field_validator("cross_marking_rules", mode="before")
    @classmethod
    def _coerce_cross_marking_rules(cls, v: object) -> dict[str, list[str]]:
        if v is None:
            return {}
        if not isinstance(v, dict):
            return {}
        out: dict[str, list[str]] = {}
        for key, raw in v.items():
            sk = str(key)
            if isinstance(raw, list):
                out[sk] = [str(x) for x in raw]
            else:
                out[sk] = []
        return out


class ExaminerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    examiner_type: ExaminerTypeSchema
    region: str = Field(min_length=1, description="Examiner home region (Enum Region value).")
    subject_ids: list[int] = Field(default_factory=list)
    deviation_weight: float | None = Field(default=None, gt=0)


class ExaminerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    examiner_type: ExaminerTypeSchema | None = None
    region: str | None = None
    subject_ids: list[int] | None = None
    deviation_weight: float | None = Field(default=None, gt=0)


class ExaminerResponse(BaseModel):
    id: UUID
    examination_id: int
    name: str
    examiner_type: ExaminerTypeSchema
    region: str
    subject_ids: list[int]
    deviation_weight: float | None
    examiner_group_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AllocationExaminerResponse(BaseModel):
    allocation_id: UUID
    examiner_id: UUID
    examiner_name: str
    examiner_type: ExaminerTypeSchema
    subject_ids: list[int]
    region: str | None = None
    zone: str | None = Field(default=None, description="Deprecated; always null.")
    allowed_zones: list[str] = Field(default_factory=list, description="Deprecated; always empty.")
    examiner_group_id: UUID | None = None
    created_at: datetime


class AllocationExaminerImportRequest(BaseModel):
    examiner_ids: list[UUID] = Field(default_factory=list)


class ExaminerBulkImportRowError(BaseModel):
    row_number: int = Field(description="1-based spreadsheet row number (row 1 is the header).")
    message: str


class ExaminerBulkImportResponse(BaseModel):
    created_count: int
    errors: list[ExaminerBulkImportRowError]


class ScriptsAllocationQuotaRow(BaseModel):
    allocation_id: UUID
    examiner_type: ExaminerTypeSchema
    subject_id: int
    quota_booklets: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScriptsAllocationQuotaItem(BaseModel):
    examiner_type: ExaminerTypeSchema
    subject_id: int
    quota_booklets: int = Field(ge=0)


class ScriptsAllocationQuotaReplace(BaseModel):
    items: list[ScriptsAllocationQuotaItem] = Field(default_factory=list)


class AllocationSolveOptions(BaseModel):
    unassigned_penalty: float = Field(default=1.0, ge=0, description="Weight on each unassigned envelope slack u_e.")
    time_limit_sec: float = Field(default=120.0, ge=1, le=3600)
    allocation_scope: AllocationScopeSchema = Field(
        default=AllocationScopeSchema.zone,
        description="Deprecated; eligibility uses examiner group UUID cross_marking_rules only.",
    )
    fairness_weight: float = Field(
        default=0.25,
        ge=0,
        description="Weight for balancing examiner total assigned booklets to avoid concentration.",
    )
    school_cohesion_weight: float = Field(
        default=0.0,
        ge=0,
        description=(
            "Secondary weight penalizing distinct schools per examiner within each MILP subproblem. "
            "Try 1e-3–1e-2 so quota and unassigned costs still dominate."
        ),
    )
    prefer_larger_booklets_epsilon: float = Field(
        default=0.0,
        ge=0,
        description=(
            "Tiny tie-break weight to prefer assigning larger booklet envelopes first when primary "
            "MILP costs are equal (e.g. 1e-6)."
        ),
    )
    enable_post_rebalance: bool = Field(
        default=False,
        description=(
            "Run an optional second pass after solve to reduce over-quota allocations by removing and "
            "reassigning envelopes where possible."
        ),
    )
    rebalance_tolerance_booklets: int = Field(
        default=20,
        ge=0,
        description="Quota tolerance band for post-rebalance targets (quota ± tolerance).",
    )
    enforce_single_series_per_examiner: bool = Field(
        default=True,
        description="When true, each examiner receives scripts from at most one series number in a solve run.",
    )
    cross_marking_rules: dict[str, list[str]] | None = Field(
        default=None,
        description="Marking group UUID -> allowed script cohort group UUIDs. Omit to use rules saved on the allocation.",
    )
    exclude_home_zone_or_region: bool = Field(
        default=True,
        description="Exclude scripts from an examiner home zone (and mapped home region when resolvable).",
    )
    solve_mode: AllocationSolveModeSchema = Field(
        default=AllocationSolveModeSchema.monolithic,
        description="monolithic: single MILP. decomposed: sequential marking groups, series-bucketed examiners, one MILP per subgroup.",
    )
    marking_group_solve_order: list[str] | None = Field(
        default=None,
        description="Marking group UUIDs first—later groups see only envelopes still unassigned. Omitted IDs append in sorted order.",
    )


class AllocationAssignmentItem(BaseModel):
    script_envelope_id: UUID
    examiner_id: UUID
    booklet_count: int
    school_code: str
    school_name: str
    zone: str
    subject_id: int
    subject_code: str
    subject_name: str
    paper_number: int
    series_number: int
    envelope_number: int


class UnassignedEnvelopeItem(BaseModel):
    script_envelope_id: UUID
    booklet_count: int
    school_code: str
    school_name: str
    region: str
    zone: str
    subject_id: int
    subject_code: str
    subject_name: str
    paper_number: int
    series_number: int
    envelope_number: int


class AllocationSubgroupItem(BaseModel):
    marking_group_id: UUID
    series_number: int
    status: AllocationSubgroupStatusSchema
    examiner_count: int = Field(ge=0)
    envelope_count: int = Field(ge=0, description="Envelopes in this subproblem (reindexed pool size).")
    eligible_pair_count: int = Field(ge=0)
    objective_value: float | None = None
    message: str | None = Field(default=None, description="Solver or skip reason.")
    time_limit_allocated_sec: float | None = Field(
        default=None,
        description="HiGHS time limit passed for this subgroup MILP (decomposed runs).",
    )


class ExaminerSubjectRunSummary(BaseModel):
    examiner_id: UUID
    examiner_name: str
    examiner_type: ExaminerTypeSchema
    subject_id: int
    subject_code: str
    subject_name: str
    quota_booklets: int | None = Field(
        default=None,
        description="Target from campaign type–subject quota row; null if not configured.",
    )
    assigned_booklets: int
    deviation: int | None = Field(
        default=None,
        description="assigned − quota when a quota exists for this examiner type and subject.",
    )


class AllocationRunResponse(BaseModel):
    id: UUID
    allocation_id: UUID
    status: AllocationRunStatusSchema
    objective_value: float | None
    solver_message: str | None
    created_at: datetime
    examiner_subject_summaries: list[ExaminerSubjectRunSummary]
    assignments: list[AllocationAssignmentItem]
    unassigned_envelope_ids: list[UUID]
    unassigned_envelopes: list[UnassignedEnvelopeItem]
    solve_mode: AllocationSolveModeSchema | None = Field(
        default=None,
        description="Echo of request mode when available (decomposed runs set this).",
    )
    subgroups: list[AllocationSubgroupItem] = Field(
        default_factory=list,
        description="Per marking group × series MILP when solve_mode is decomposed.",
    )

    model_config = {"from_attributes": True}


class AllocationRunAssignmentUpsert(BaseModel):
    script_envelope_id: UUID
    examiner_id: UUID


class AllocationRunListItem(BaseModel):
    id: UUID
    allocation_id: UUID
    status: AllocationRunStatusSchema
    objective_value: float | None
    solver_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
