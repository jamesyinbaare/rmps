from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ExaminerLocationUpsert(BaseModel):
    town: str = Field(min_length=1, max_length=255)
    ghanapost_gps_address: str = Field(min_length=1, max_length=50)


class ExaminerLocationResponse(BaseModel):
    town: str
    ghanapost_gps_address: str
    updated_at: datetime
