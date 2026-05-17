"""Schemas for singleton system settings (e.g. active examination)."""

from pydantic import BaseModel, Field

from app.schemas.examination import ExaminationResponse


class ActiveExaminationPut(BaseModel):
    """Pinned active examination; ``null`` clears the pin (fall through to env / latest)."""

    active_examination_id: int | None = Field(
        default=None,
        description="Examinations.id to pin as active; null clears the admin pin.",
    )


class ActiveExaminationAdminResponse(BaseModel):
    """Admin view of active examination configuration."""

    active_examination_id: int | None = Field(
        default=None,
        description="Admin-pinned examinations.id, if set.",
    )
    resolved_examination_id: int = Field(
        description="Examination actually used after applying precedence rules.",
    )
    examination: ExaminationResponse
