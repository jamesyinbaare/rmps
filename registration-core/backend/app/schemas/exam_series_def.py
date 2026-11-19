"""Schemas for exam series catalog."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExamSeriesDefinitionBase(BaseModel):
    short_name: str = Field(..., min_length=1, max_length=50)
    long_name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = 0
    is_active: bool = True


class ExamSeriesDefinitionCreate(ExamSeriesDefinitionBase):
    pass


class ExamSeriesDefinitionUpdate(BaseModel):
    short_name: str | None = Field(None, min_length=1, max_length=50)
    long_name: str | None = Field(None, min_length=1, max_length=255)
    sort_order: int | None = None
    is_active: bool | None = None


class ExamSeriesDefinitionResponse(ExamSeriesDefinitionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
