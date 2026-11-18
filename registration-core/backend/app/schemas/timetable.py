from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class TimetableDownloadFilter(str, Enum):
    """Enum for timetable subject filter types."""

    ALL = "ALL"
    CORE_ONLY = "CORE_ONLY"
    ELECTIVE_ONLY = "ELECTIVE_ONLY"


class TimetableDownloadRequest(BaseModel):
    """Schema for timetable download request."""

    exam_id: int = Field(..., description="Examination ID")
    school_id: Optional[int] = Field(None, description="School ID (optional, for school-specific timetable)")
    programme_id: Optional[int] = Field(None, description="Programme ID (optional, for programme-specific timetable)")
    subject_filter: TimetableDownloadFilter = Field(
        default=TimetableDownloadFilter.ALL,
        description="Filter by subject type: ALL, CORE_ONLY, or ELECTIVE_ONLY",
    )
