from __future__ import annotations

from pydantic import BaseModel


class ExaminerPublicScriptsAllocationRow(BaseModel):
    school_code: str
    school_name: str
    envelope_number: int
    series_number: int
    booklet_count: int


class ExaminerPublicScriptsAllocationBlock(BaseModel):
    subject_code: str
    subject_name: str
    paper_number: int
    rows: list[ExaminerPublicScriptsAllocationRow]
    total_booklets: int


class ExaminerPublicScriptsAllocationResponse(BaseModel):
    blocks: list[ExaminerPublicScriptsAllocationBlock]
