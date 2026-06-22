from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class ExaminerBackgroundOccupationTypeSchema(str, Enum):
    teacher = "teacher"
    other = "other"


class ExaminerBackgroundSurveyUpsert(BaseModel):
    occupation_type: ExaminerBackgroundOccupationTypeSchema
    institution_name: str | None = Field(default=None, max_length=255)
    teaching_subject: str | None = Field(default=None, max_length=255)
    industry: str | None = Field(default=None, max_length=255)
    specialization: str | None = Field(default=None, max_length=255)


class ExaminerBackgroundSurveyResponse(BaseModel):
    occupation_type: ExaminerBackgroundOccupationTypeSchema
    institution_name: str | None = None
    teaching_subject: str | None = None
    industry: str | None = None
    specialization: str | None = None
    updated_at: datetime
