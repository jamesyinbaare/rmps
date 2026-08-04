"""Schemas for application settings endpoints."""

from pydantic import BaseModel, Field


class ClerkDigitalEntrySetting(BaseModel):
    enabled: bool = Field(..., description="Whether dataclerks may use digital score entry")


class ClerkDigitalEntryUpdate(BaseModel):
    enabled: bool = Field(..., description="Enable or disable digital entry for all dataclerks")
