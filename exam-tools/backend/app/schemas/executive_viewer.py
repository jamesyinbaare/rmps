from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ExecutiveViewerCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)


class ExecutiveViewerCreatedResponse(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr
