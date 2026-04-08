from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepotCreate(BaseModel):
    code: str = Field(..., max_length=32)
    name: str = Field(..., max_length=255)


class DepotUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)


class DepotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    created_at: datetime
    updated_at: datetime


class DepotListResponse(BaseModel):
    items: list[DepotResponse]
    total: int


class DepotSchoolRow(BaseModel):
    id: UUID
    code: str
    name: str


class DepotSchoolListResponse(BaseModel):
    items: list[DepotSchoolRow]


class DepotKeeperCreate(BaseModel):
    depot_code: str = Field(..., max_length=32)
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)


class DepotKeeperCreatedResponse(BaseModel):
    id: UUID
    full_name: str
    username: str
    depot_code: str


class DepotKeeperRow(BaseModel):
    id: UUID
    full_name: str
    username: str | None
    depot_code: str
    depot_name: str


class DepotKeeperListResponse(BaseModel):
    items: list[DepotKeeperRow]
    total: int
