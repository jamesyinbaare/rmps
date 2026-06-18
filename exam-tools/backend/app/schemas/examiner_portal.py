"""Schemas for examiner portal link rotation."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class ExaminerPortalLinkRegenerateRequest(BaseModel):
    confirm: bool = False


class ExaminerPortalLinkRegenerateResponse(BaseModel):
    examiner_id: UUID
    portal_url: str
