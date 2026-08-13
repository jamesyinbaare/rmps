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
    # Rate limit must stay at or below your Reducto plan RPS (Standard ~1, Growth ~10, Enterprise 100+).
    # Queue workers = concurrent documents in flight; the shared token bucket still caps submit RPS.
    # Safe starting point at Growth: REDUCTO_RATE_LIMIT_PER_SECOND=10, REDUCTO_QUEUE_WORKERS=4
    # (try 6–8 when extracts are slow; extra workers mostly wait on the rate limiter).
    reducto_enabled: bool = True
    reducto_api_key: str | None = None
    reducto_api_url: str = "https://api.reducto.ai"
    reducto_rate_limit_per_second: float = 10.0  # Cap API requests/sec (match plan RPS or slightly under)
    reducto_queue_workers: int | None = 4  # Concurrent docs; None = auto from rate limit (rate/2.5, capped)
    reducto_queue_workers_max: int = 50  # Hard ceiling for env config and runtime resize
    reducto_extraction_prompt: str = (
        "This is an examination score sheet with a candidate table. "
        "Extract only values that are explicitly written or marked on the sheet. "
        "Do not infer or guess values for blank, empty, or unmarked cells. "
        "For each candidate row extract: sn, index_number, candidate_name, attend, score, and verify. "
        "Attendance (attend): check mark or symbol if present; 'A'/'AA' only when written. "
        "Score and verify are three distinct cases: "
        "(1) blank/empty cell → null (not entered); "
        "(2) letters 'A' or 'AA' written in that cell → 'A'/'AA' (absent); "
        "(3) a written number including 0 → that number. "
        "Blank is never absence and never zero. "
        "Never invent 'A', 'AA', or 0 for a blank score/verify cell. "
        "Never copy attendance absence into score/verify unless those letters are written in the score/verify cell itself. "
        "When the digit 0 is visibly written for score and/or verify, extract 0 — do not replace a written zero with null. "
        "Scores are non-negative and are not limited to 100. "
        "Also extract sheet metadata: sheet_id, series, paper/test type, centre, and subject. "
        "Preserve exact marks and text as they appear."
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
                            "anyOf": [
                                {
                                    "type": "null",
                                    "description": "REQUIRED when the score cell is blank/empty. Not entered — distinct from absent and from zero.",
                                },
                                {
                                    "type": "number",
                                    "minimum": 0,
                                    "description": "Numeric score only when a number is written in the cell. 0 only if the digit 0 is written. No upper limit.",
                                },
                                {
                                    "type": "string",
                                    "enum": ["A", "AA"],
                                    "description": "Only when 'A' or 'AA' is explicitly written in the score cell. Do not use for blank cells.",
                                },
                            ],
                            "description": (
                                "Examination score from the score column only. "
                                "null if blank/empty; number if a number (including 0) is written; "
                                "'A'/'AA' only if those letters are written in this cell. "
                                "Do not invent values. Blank ≠ absent ≠ 0."
                            ),
                        },
                        "verify": {
                            "anyOf": [
                                {
                                    "type": "null",
                                    "description": "REQUIRED when the verify cell is blank/empty. Not entered — distinct from absent and from zero.",
                                },
                                {
                                    "type": "number",
                                    "minimum": 0,
                                    "description": "Numeric verify score only when a number is written in the cell. 0 only if the digit 0 is written. No upper limit.",
                                },
                                {
                                    "type": "string",
                                    "enum": ["A", "AA"],
                                    "description": "Only when 'A' or 'AA' is explicitly written in the verify cell. Do not use for blank cells.",
                                },
                            ],
                            "description": (
                                "Verification score from the verify column only. "
                                "null if blank/empty; number if a number (including 0) is written; "
                                "'A'/'AA' only if those letters are written in this cell. "
                                "Do not invent values. Blank ≠ absent ≠ 0."
                            ),
                        },
                    },
                    "required": ["sn", "index_number", "attend", "score", "verify"],
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
