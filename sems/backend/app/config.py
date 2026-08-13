import json
from typing import Annotated, Any, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    database_url: str = ""
    environment: str = "dev"
    # Comma-separated in env (CORS_ORIGINS); browser origins allowed for credentialed API calls
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"],
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if v is None or v == "":
            return ["http://localhost:3000", "http://127.0.0.1:3000"]
        if isinstance(v, str):
            raw = v.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed if str(x).strip()]
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    # Storage settings
    storage_backend: str = "local"  # local, gcs
    storage_path: str = "storage/documents"
    storage_max_size: int = 50 * 1024 * 1024  # 50MB default
    gcs_bucket_name: str = ""
    gcs_project_id: str = ""
    gcs_credentials_path: str = ""
    gcs_documents_prefix: str = "sems/documents"
    gcs_photos_prefix: str = "sems/photos"
    gcs_score_sheets_prefix: str = "sems/score-sheets"
    gcs_certificates_prefix: str = "sems/certificates"
    # PDF generation settings
    templates_path: str = "templates"  # Path to HTML templates directory
    pdf_output_path: str = "score_sheets"  # Path to save generated PDF score sheets
    certificate_output_path: str = "storage/certificates"  # Local path for certificate PDFs
    # Extraction settings
    barcode_enabled: bool = True
    ocr_enabled: bool = True
    min_confidence_threshold: float = 0.7
    # OCR preprocessing settings
    ocr_resize_width: int = 1654
    ocr_resize_height: int = 2339
    ocr_roi_left: int = 1120
    ocr_roi_top: int = 370
    ocr_roi_right: int = 1530
    ocr_roi_bottom: int = 445
    # Batch settings
    batch_max_files: int = 100
    batch_timeout: int = 3600  # 1 hour in seconds
    # Duplicate detection settings
    reject_duplicate_files: bool = True  # If True, reject duplicates; If False, return existing document
    # Direct-to-storage upload (signed URL / local content PUT)
    upload_signed_url_ttl_minutes: int = 30
    upload_initiate_batch_max: int = 200
    upload_pending_ttl_hours: int = 2
    # Reducto API settings
    reducto_enabled: bool = True
    reducto_api_key: str | None = None
    reducto_api_url: str = "https://api.reducto.ai"
    reducto_rate_limit_per_second: float = 10.0  # Rate limit for Reducto API requests (requests per second)
    reducto_queue_workers: int | None = None  # Number of worker threads. If None, auto-calculated from rate limit
    reducto_extraction_prompt: str = (
        "Extract examination score data from this document. "
        "Focus on the main score table containing candidate information. "
        "For each candidate row, extract: serial number (sn), index number, candidate name, "
        "attendance (check mark for present, 'A' or 'AA' for absent), "
        "score (0 or any positive number, 'A'/'AA' only when those letters are written, or null if blank), "
        "and verification score (0 or any positive number, 'A'/'AA' only when those letters are written, or null if blank). "
        "Blank/empty score or verify cells must be null (not entered) — blank is not absence. "
        "Use 'A' or 'AA' for score/verify only when those letters are explicitly written in the cell. "
        "Note: 0 is a valid score (present candidate who scored zero), not absence. "
        "When the sheet shows 0 for score and/or verify, extract the digit 0 for both fields — "
        "never use '-', blank, null, or omit a written zero. "
        "Scores are non-negative and are not limited to 100. "
        "Also extract sheet metadata: sheet_id, series, paper/test type, centre, and subject. "
        "Preserve exact values as they appear in the document, including check marks and absence indicators."
    )
    reducto_extraction_schema: dict | None = {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "description": "List of candidates examination scores in a table. Extract all rows from the score table, including candidates who were absent.",
                "items": {
                    "type": "object",
                    "properties": {
                        "sn": {
                            "type": "number",
                            "description": "Candidate serial number or row number in the table.",
                        },
                        "index_number": {
                            "type": "string",
                            "description": "Candidate index number (alphanumeric identifier).",
                        },
                        "candidate_name": {
                            "type": "string",
                            "description": "Candidate full name as written on the examination sheet.",
                        },
                        "attend": {
                            "type": "string",
                            "description": "Attendance indicator. Extract the exact value as it appears: a check mark (✓, ✔, √, X, or any mark/symbol) indicates the candidate attended and should be extracted as-is, 'A' or 'AA' indicates absence. Preserve the exact symbol or text found in the document without conversion.",
                        },
                        "score": {
                            "oneOf": [
                                {
                                    "type": "number",
                                    "minimum": 0,
                                    "description": "Candidate examination score as a non-negative number (0 or greater). 0 is valid. No upper limit.",
                                },
                                {
                                    "type": "string",
                                    "enum": ["A", "AA"],
                                    "description": "Absence indicator. Use 'A' or 'AA' only when those letters are explicitly written in the cell.",
                                },
                                {
                                    "type": "null",
                                    "description": "Empty/blank cell — not entered (distinct from absent).",
                                },
                            ],
                            "description": "Candidate examination score. Non-negative number (0 or greater), 'A'/'AA' only when written, or null if the cell is blank/empty. Blank is not absence. 0 is a valid score, not absence.",
                        },
                        "verify": {
                            "oneOf": [
                                {
                                    "type": "number",
                                    "minimum": 0,
                                    "description": "Verification score (duplicate of score field for verification purposes). Non-negative number (0 or greater). 0 is valid. No upper limit.",
                                },
                                {
                                    "type": "string",
                                    "enum": ["A", "AA"],
                                    "description": "Absence indicator. Use 'A' or 'AA' only when those letters are explicitly written in the cell.",
                                },
                                {
                                    "type": "null",
                                    "description": "Empty/blank cell — not entered (distinct from absent).",
                                },
                            ],
                            "description": "Verification score (repeated score for verification). Non-negative number (0 or greater), 'A'/'AA' only when written, or null if the cell is blank/empty. Blank is not absence. 0 is a valid score, not absence.",
                        },
                    },
                    "required": ["sn", "index_number", "attend", "score"],
                },
            },
            "sheet_id": {
                "type": "string",
                "description": "Unique identifier for the examination sheet (usually found in the header or barcode area).",
            },
            "series": {
                "type": "number",
                "description": "The series number or subject series (e.g., 1, 2, 3, etc.).",
            },
            "paper": {
                "type": "number",
                "description": "The paper number or test type (1 = Objectives, 2 = Essay, 3 = Practicals).",
            },
            "centre": {
                "type": "string",
                "description": "The examination centre name or code.",
            },
            "subject": {
                "type": "string",
                "description": "The subject code and name (e.g., '701 Mathematics' or '701 - Mathematics').",
            },
        },
        "required": ["candidates"],
    }  # Schema for structured data extraction
    # Cache settings
    cache_backend: str = "memory"  # memory, redis
    cache_ttl: int = 300  # 5 minutes default
    cache_max_size: int = 1000  # Max cached items for in-memory
    redis_url: str | None = None  # Optional Redis URL
    # Photo validation settings
    photo_max_width: int = 600
    photo_max_height: int = 600
    photo_min_width: int = 200
    photo_min_height: int = 200
    photo_max_file_size: int = 2 * 1024 * 1024  # 2MB
    photo_storage_path: str = "storage/photos"
    # Authentication settings
    secret_key: str = "your-secret-key-change-in-production"  # Should be set via environment variable
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    inactivity_timeout_minutes: int = 30  # For frontend reference
    password_min_length: int = 8
    # Super admin initialization settings
    super_admin_email: str = ""  # Required: Email for the initial SUPER_ADMIN user
    super_admin_password: str = ""  # Required: Password for the initial SUPER_ADMIN user
    super_admin_full_name: str = ""  # Required: Full name for the initial SUPER_ADMIN user

    @model_validator(mode="after")
    def validate_secret_key_for_environment(self) -> Self:
        env = (self.environment or "").strip().lower()
        if env not in ("staging", "production", "prod"):
            return self
        if not self.secret_key or self.secret_key == "your-secret-key-change-in-production":
            raise ValueError(
                "SECRET_KEY must be set to a non-default value when ENVIRONMENT is staging/production."
            )
        return self


class LoggingSettings(BaseSettings):
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"  # "text" or "json"
    ENV: str = "dev"  # dev | staging | prod

    class Config:
        env_prefix = "APP_"


logging_settings = LoggingSettings()

settings = Settings()  # type: ignore
