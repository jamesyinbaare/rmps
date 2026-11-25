"""Schemas for school registration completion confirmation."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProgrammeCountBreakdown(BaseModel):
    programme_id: int | None = None
    code: str
    name: str
    total: int
    by_type: dict[str, int] = Field(default_factory=dict)


class SchoolExamCounts(BaseModel):
    total_candidates: int
    counts_by_type: dict[str, int]
    counts_by_programme: list[ProgrammeCountBreakdown]


class SchoolCompletionStatusResponse(BaseModel):
    exam_id: int
    school_id: int
    feature_enabled: bool
    status: str | None = None  # pending | confirmed | withdrawn | null
    is_confirmed: bool = False
    is_locked: bool = False
    can_withdraw: bool = False
    can_download: bool = False
    can_upload: bool = False
    registration_open: bool = False
    live_counts: SchoolExamCounts
    snapshot_total: int | None = None
    snapshot_counts_by_type: dict[str, int] | None = None
    snapshot_counts_by_programme: list[dict[str, Any]] | None = None
    declaration_generated_at: datetime | None = None
    confirmed_at: datetime | None = None
    withdrawn_at: datetime | None = None
    principal_email_sent: bool = False
    principal_sms_sent: bool = False
    notify_email_error: str | None = None
    notify_sms_error: str | None = None

    model_config = ConfigDict(from_attributes=True)
