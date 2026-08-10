"""Schemas for certificate templates and issuance (Phase 2)."""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import CertificateIssuanceStatus, ExamType


CertificateFieldSource = Literal["exam_data", "static"]
CertificateFieldType = Literal["text", "subjects", "image"]


def _data_field(
    key: str,
    label: str,
    *,
    field_type: CertificateFieldType = "text",
    description: str = "",
    **defaults: Any,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "source": "exam_data",
        "type": field_type,
        "description": description,
        "unique": True,
        "defaults": {
            "key": key,
            "type": field_type,
            "label": label,
            "x_mm": 40,
            "y_mm": 80,
            "font_size": 11,
            "align": "left",
            "max_width_mm": 130,
            **defaults,
        },
    }


# Catalog of fields users can add to a template layout.
# exam_data → filled from registration/exam at generate time
# static → fixed text or uploaded image on the template
CERTIFICATE_FIELD_CATALOG: list[dict[str, Any]] = [
    _data_field(
        "candidate_name",
        "Candidate name",
        description="Candidate full name from the registration",
        font_size=14,
        y_mm=80,
    ),
    _data_field(
        "index_number",
        "Index number",
        description="Candidate index number for this examination",
        font_size=12,
        y_mm=92,
        max_width_mm=80,
    ),
    _data_field(
        "school_name",
        "School name",
        description="School name (and code) from the candidate's school",
        y_mm=104,
    ),
    _data_field(
        "school_code",
        "School code",
        description="School code only",
        y_mm=104,
        max_width_mm=40,
    ),
    _data_field(
        "programme_name",
        "Programme",
        description="Candidate programme name",
        y_mm=116,
    ),
    _data_field(
        "certificate_number",
        "Certificate number",
        description="Allocated certificate number",
        font_size=10,
        y_mm=45,
        max_width_mm=90,
    ),
    _data_field(
        "subjects",
        "Subjects & grades",
        field_type="subjects",
        description="List of registered subjects with stored grades",
        y_mm=125,
        font_size=10,
        line_height_mm=6,
        columns=["subject_name", "grade"],
    ),
    _data_field(
        "issuance_date",
        "Date of completion",
        description="Official completion/issuance date (not the printed date)",
        y_mm=200,
        max_width_mm=90,
    ),
    _data_field(
        "exam_year",
        "Examination year",
        description="Year of the examination",
        y_mm=50,
        max_width_mm=40,
    ),
    _data_field(
        "exam_type",
        "Examination type",
        description="e.g. Certificate II, Diploma",
        y_mm=56,
    ),
    _data_field(
        "exam_series",
        "Examination series",
        description="e.g. MAY/JUNE, NOV/DEC",
        y_mm=62,
        max_width_mm=50,
    ),
    _data_field(
        "exam_description",
        "Examination description",
        description="Optional description on the exam record",
        y_mm=68,
    ),
    {
        "key": "static_text",
        "label": "Custom static text",
        "source": "static",
        "type": "text",
        "description": "Fixed wording on the certificate (e.g. title, registrar title)",
        "unique": False,
        "defaults": {
            "type": "text",
            "label": "Custom text",
            "static_value": "Custom text",
            "x_mm": 40,
            "y_mm": 180,
            "font_size": 11,
            "align": "left",
            "max_width_mm": 100,
        },
    },
    {
        "key": "image",
        "label": "Image (signature, seal, logo)",
        "source": "static",
        "type": "image",
        "description": "Upload after saving the template (signature, seal, logo)",
        "unique": False,
        "defaults": {
            "type": "image",
            "label": "Image",
            "x_mm": 40,
            "y_mm": 220,
            "width_mm": 45,
            "height_mm": 18,
        },
    },
]


# New templates start empty; users add fields from the catalog.
DEFAULT_CERTIFICATE_LAYOUT: dict[str, Any] = {
    "fields": [],
    "date_format": "%d %B %Y",
}


class CertificateFieldCatalogItem(BaseModel):
    key: str
    label: str
    source: CertificateFieldSource
    type: CertificateFieldType
    description: str = ""
    unique: bool = True
    defaults: dict[str, Any] = Field(default_factory=dict)


class CertificateFieldCatalogResponse(BaseModel):
    items: list[CertificateFieldCatalogItem]


class CertificateTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    exam_id: int = Field(..., description="Examination this template belongs to")
    page_width_mm: float = Field(210.0, gt=0)
    page_height_mm: float = Field(297.0, gt=0)
    layout_json: dict[str, Any] = Field(default_factory=lambda: dict(DEFAULT_CERTIFICATE_LAYOUT))
    is_active: bool = True


class CertificateTemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    exam_id: int | None = None
    page_width_mm: float | None = Field(None, gt=0)
    page_height_mm: float | None = Field(None, gt=0)
    layout_json: dict[str, Any] | None = None
    is_active: bool | None = None


class CertificateTemplateResponse(BaseModel):
    id: int
    name: str
    exam_type: ExamType | None = None
    exam_id: int | None = None
    page_width_mm: float
    page_height_mm: float
    layout_json: dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CertificateTemplateListResponse(BaseModel):
    items: list[CertificateTemplateResponse]
    total: int


class CertificateIssuanceResponse(BaseModel):
    id: int
    exam_registration_id: int
    certificate_number: str
    status: CertificateIssuanceStatus
    layout_snapshot_json: dict[str, Any] | None = None
    grades_snapshot_json: list[dict[str, Any]] | None = None
    pdf_storage_path: str | None = None
    supersedes_id: int | None = None
    void_reason: str | None = None
    issuance_date: date | None = None
    generated_by_user_id: UUID | None = None
    generated_at: datetime
    printed_by_user_id: UUID | None = None
    printed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MarkPrintedRequest(BaseModel):
    printed: bool = True


class CertificateTemplateAssetResponse(BaseModel):
    id: int
    template_id: int
    key: str
    label: str | None = None
    file_name: str
    mime_type: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CertificateTemplateAssetListResponse(BaseModel):
    items: list[CertificateTemplateAssetResponse]
    total: int
