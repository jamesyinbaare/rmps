from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

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
    region: str | None = None
    zone: str | None = None
    subject_ids: list[int] = Field(default_factory=list)
    allowed_zones: list[str] = Field(default_factory=list, description="Source school zones this examiner may mark.")
    deviation_weight: float | None = Field(default=None, gt=0)
    allowed_region: str | None = Field(
        default=None,
        description="Examiner's region; all school zones in this region unless restrict_zone narrows to one.",
    )
    restrict_zone: str | None = Field(
        default=None,
        description="Optional zone letter within allowed_region (single zone within that region).",
    )

    @model_validator(mode="after")
    def _zones_source(self) -> ExaminerCreate:
        if self.allowed_zones:
            raise ValueError("Use allowed_region and optional restrict_zone instead of allowed_zones")
        if not self.allowed_region or not str(self.allowed_region).strip():
            raise ValueError("allowed_region is required")
        return self


class ExaminerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    examiner_type: ExaminerTypeSchema | None = None
    region: str | None = None
    zone: str | None = None
    subject_ids: list[int] | None = None
    allowed_zones: list[str] | None = None
    deviation_weight: float | None = Field(default=None, gt=0)
    allowed_region: str | None = None
    restrict_zone: str | None = None

    @model_validator(mode="after")
    def _zones_source_update(self) -> ExaminerUpdate:
        if self.allowed_zones is not None and (self.allowed_region is not None or self.restrict_zone is not None):
            raise ValueError("Use either allowed_zones or allowed_region/restrict_zone, not both")
        if self.allowed_zones is not None:
            if len(self.allowed_zones) == 0:
                raise ValueError("Use allowed_region and optional restrict_zone to set marking scope")
            if len(self.allowed_zones) > 1:
                raise ValueError(
                    "allowed_zones may list at most one zone; use allowed_region to cover a whole region"
                )
        rz = self.restrict_zone
        ar = self.allowed_region
        if rz is not None and str(rz).strip():
            if ar is None or not str(ar).strip():
                raise ValueError("allowed_region is required when restrict_zone is set")
        return self


class ExaminerResponse(BaseModel):
    id: UUID
    examination_id: int
    name: str
    examiner_type: ExaminerTypeSchema
    region: str | None
    zone: str | None
    subject_ids: list[int]
    allowed_zones: list[str]
    deviation_weight: float | None
    created_at: datetime
    updated_at: datetime
    prefill_region: str | None = Field(
        default=None,
        description="When this examiner’s allowed zones match a full region, that region name for form prefill.",
    )
    prefill_zone: str | None = Field(
        default=None,
        description="When scope is a single zone, or a zone within a region, the zone letter for form prefill.",
    )

    model_config = {"from_attributes": True}


class AllocationExaminerResponse(BaseModel):
    allocation_id: UUID
    examiner_id: UUID
    examiner_name: str
    examiner_type: ExaminerTypeSchema
    subject_ids: list[int]
    region: str | None = None
    zone: str | None = None
    allowed_zones: list[str]
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
        description="Whether cross-marking and eligibility checks are evaluated by zone or by region.",
    )
    fairness_weight: float = Field(
        default=0.25,
        ge=0,
        description="Weight for balancing examiner total assigned booklets to avoid concentration.",
    )
    enforce_single_series_per_examiner: bool = Field(
        default=True,
        description="When true, each examiner receives scripts from at most one series number in a solve run.",
    )
    cross_marking_rules: dict[str, list[str]] = Field(
        default_factory=dict,
        description="Mapping of examiner source zone/region to allowed script source zones/regions.",
    )
    exclude_home_zone_or_region: bool = Field(
        default=True,
        description="Exclude scripts from an examiner home zone (and mapped home region when resolvable).",
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
